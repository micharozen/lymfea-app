-- Migration: Update lookup_gift_card_by_code for the customer portal
-- Self-purchased gift cards now also have redemption codes (from 20260415150000).
-- The portal needs to look up ANY gift card code, not just is_gift=true.
-- Also return hotel images for venue branding and is_gift flag.

DROP FUNCTION IF EXISTS lookup_gift_card_by_code(TEXT, TEXT);

CREATE OR REPLACE FUNCTION lookup_gift_card_by_code(
  _code TEXT,
  _attempt_key TEXT
)
RETURNS TABLE (
  bundle_type TEXT,
  title TEXT,
  title_en TEXT,
  cover_image_url TEXT,
  sender_name TEXT,
  gift_message TEXT,
  total_sessions INTEGER,
  total_amount_cents INTEGER,
  expires_at DATE,
  hotel_id TEXT,
  hotel_name TEXT,
  already_claimed BOOLEAN,
  is_gift BOOLEAN,
  is_active BOOLEAN,
  hotel_image TEXT,
  hotel_cover_image TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _attempts INTEGER;
  _ctb_id UUID;
  _ctb customer_treatment_bundles%ROWTYPE;
  _tb treatment_bundles%ROWTYPE;
  _hotel hotels%ROWTYPE;
BEGIN
  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));
  IF length(_code) <> 10 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;
  IF _attempt_key IS NULL OR length(_attempt_key) < 3 THEN
    RAISE EXCEPTION 'Missing attempt key';
  END IF;

  SELECT COUNT(*) INTO _attempts
  FROM gift_code_attempts
  WHERE attempt_key = _attempt_key
    AND created_at > now() - interval '5 minutes';

  IF _attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts, please retry later';
  END IF;

  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  -- Look up any card with this code (self-purchase or gift)
  SELECT id INTO _ctb_id
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
  LIMIT 1;

  IF _ctb_id IS NULL THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;

  SELECT * INTO _ctb FROM customer_treatment_bundles WHERE id = _ctb_id;
  SELECT * INTO _tb FROM treatment_bundles WHERE id = _ctb.bundle_id;
  SELECT * INTO _hotel FROM hotels WHERE id = _ctb.hotel_id;

  UPDATE gift_code_attempts
  SET succeeded = true
  WHERE id = (SELECT id FROM gift_code_attempts WHERE attempt_key = _attempt_key ORDER BY created_at DESC LIMIT 1);

  RETURN QUERY
  SELECT
    _tb.bundle_type,
    COALESCE(_tb.title, _tb.name),
    COALESCE(_tb.title_en, _tb.name_en),
    _tb.cover_image_url,
    _ctb.sender_name,
    _ctb.gift_message,
    _ctb.total_sessions,
    _ctb.total_amount_cents,
    _ctb.expires_at,
    _ctb.hotel_id,
    _hotel.name,
    (_ctb.claimed_at IS NOT NULL),
    _ctb.is_gift,
    (_ctb.beneficiary_customer_id IS NOT NULL AND _ctb.status = 'active' AND _ctb.expires_at >= CURRENT_DATE),
    _hotel.image,
    _hotel.cover_image;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_gift_card_by_code(TEXT, TEXT) TO anon, authenticated, service_role;
