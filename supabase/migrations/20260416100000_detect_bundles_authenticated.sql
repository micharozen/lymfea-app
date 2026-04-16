-- RPC: detect_bundles_for_auth_customer
-- Authenticated version of detect_bundles_for_booking + detect_gift_cards_for_booking.
-- Uses auth.uid() instead of phone. Returns JSON with session_bundles + amount_bundles.
-- ============================================

CREATE OR REPLACE FUNCTION detect_bundles_for_auth_customer(
  _hotel_id TEXT,
  _treatment_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_user_id UUID;
  _customer_id UUID;
  _session_bundles JSON;
  _amount_bundles JSON;
BEGIN
  _auth_user_id := auth.uid();
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _customer_id
  FROM customers
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN json_build_object('session_bundles', '[]'::JSON, 'amount_bundles', '[]'::JSON);
  END IF;

  -- Session bundles (cure + gift_treatments)
  SELECT COALESCE(json_agg(row_to_json(sb)), '[]'::JSON)
  INTO _session_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      ctb.total_sessions,
      ctb.used_sessions,
      (ctb.total_sessions - ctb.used_sessions) AS remaining_sessions,
      ctb.expires_at,
      array_agg(DISTINCT tbi.treatment_id) AS eligible_treatment_ids
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    JOIN treatment_bundle_items tbi ON tbi.bundle_id = tb.id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type IN ('cure', 'gift_treatments')
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_sessions IS NOT NULL
      AND ctb.used_sessions < ctb.total_sessions
      AND (
        _treatment_ids IS NULL
        OR tbi.treatment_id = ANY(_treatment_ids)
      )
    GROUP BY ctb.id, tb.name, tb.name_en, tb.bundle_type, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
    HAVING (
      _treatment_ids IS NULL
      OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
    )
  ) sb;

  -- Amount bundles (gift_amount)
  SELECT COALESCE(json_agg(row_to_json(ab)), '[]'::JSON)
  INTO _amount_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.cover_image_url,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      (ctb.total_amount_cents - ctb.used_amount_cents) AS remaining_amount_cents,
      ctb.expires_at
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type = 'gift_amount'
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_amount_cents IS NOT NULL
      AND ctb.used_amount_cents < ctb.total_amount_cents
  ) ab;

  RETURN json_build_object(
    'session_bundles', _session_bundles,
    'amount_bundles', _amount_bundles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_bundles_for_auth_customer(TEXT, UUID[]) TO authenticated;

-- Revoke anon access to phone-based RPCs (security hardening)
REVOKE EXECUTE ON FUNCTION detect_bundles_for_booking(TEXT, TEXT, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION detect_gift_cards_for_booking(TEXT, TEXT) FROM anon;
