-- Migration: Gift cards always get a redemption code
-- Self-purchased gift cards now also get a code so the buyer can access the customer portal.
-- Previously, only is_gift=true rows had a redemption_code.

-- 1. Relax CHECK constraint: allow redemption_code on is_gift=false rows
ALTER TABLE customer_treatment_bundles DROP CONSTRAINT IF EXISTS chk_ctb_gift_shape;
ALTER TABLE customer_treatment_bundles ADD CONSTRAINT chk_ctb_gift_shape CHECK (
  (is_gift = false AND gift_delivery_mode IS NULL)
  OR (is_gift = true AND redemption_code IS NOT NULL AND gift_delivery_mode IS NOT NULL)
);

-- 2. Update create_customer_gift_card to always generate a code
CREATE OR REPLACE FUNCTION create_customer_gift_card(
  _bundle_id UUID,
  _purchaser_customer_id UUID,
  _hotel_id TEXT,
  _is_gift BOOLEAN,
  _gift_delivery_mode TEXT DEFAULT NULL,
  _sender_name TEXT DEFAULT NULL,
  _sender_email TEXT DEFAULT NULL,
  _recipient_name TEXT DEFAULT NULL,
  _recipient_email TEXT DEFAULT NULL,
  _gift_message TEXT DEFAULT NULL,
  _payment_reference TEXT DEFAULT NULL
)
RETURNS TABLE (customer_bundle_id UUID, redemption_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template treatment_bundles%ROWTYPE;
  _beneficiary UUID;
  _code TEXT;
  _new_id UUID;
BEGIN
  SELECT * INTO _template FROM treatment_bundles WHERE id = _bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle template not found: %', _bundle_id;
  END IF;
  IF _template.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle template is not active';
  END IF;
  IF _template.bundle_type NOT IN ('gift_treatments', 'gift_amount') THEN
    RAISE EXCEPTION 'Not a gift card template';
  END IF;

  -- Always generate a code so every gift card holder can access the portal
  _code := generate_gift_redemption_code();

  IF _is_gift THEN
    IF _gift_delivery_mode IS NULL OR _gift_delivery_mode NOT IN ('email', 'print') THEN
      RAISE EXCEPTION 'Invalid gift_delivery_mode';
    END IF;
    IF _gift_delivery_mode = 'email' AND (_recipient_email IS NULL OR length(trim(_recipient_email)) = 0) THEN
      RAISE EXCEPTION 'recipient_email is required for email delivery';
    END IF;
    _beneficiary := NULL;
  ELSE
    _beneficiary := _purchaser_customer_id;
  END IF;

  INSERT INTO customer_treatment_bundles (
    bundle_id,
    customer_id,
    beneficiary_customer_id,
    hotel_id,
    total_sessions,
    total_amount_cents,
    expires_at,
    is_gift,
    gift_delivery_mode,
    sender_name,
    sender_email,
    recipient_name,
    recipient_email,
    gift_message,
    redemption_code,
    payment_reference
  )
  VALUES (
    _bundle_id,
    _purchaser_customer_id,
    _beneficiary,
    _hotel_id,
    _template.total_sessions,
    _template.amount_cents,
    CURRENT_DATE + _template.validity_days,
    _is_gift,
    CASE WHEN _is_gift THEN _gift_delivery_mode ELSE NULL END,
    _sender_name,
    _sender_email,
    CASE WHEN _is_gift THEN _recipient_name ELSE NULL END,
    CASE WHEN _is_gift AND _gift_delivery_mode = 'email' THEN _recipient_email ELSE NULL END,
    _gift_message,
    _code,
    _payment_reference
  )
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _new_id, _code;
END;
$$;

GRANT EXECUTE ON FUNCTION create_customer_gift_card(
  UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- 3. Backfill: generate codes for existing self-purchase gift cards that lack one
UPDATE customer_treatment_bundles
SET redemption_code = generate_gift_redemption_code()
WHERE is_gift = false
  AND redemption_code IS NULL
  AND bundle_id IN (SELECT id FROM treatment_bundles WHERE bundle_type IN ('gift_treatments', 'gift_amount'));
