-- Public gift card claim: the redemption code acts as proof of ownership.
-- No Supabase Auth required — recipients just enter their email + name.

CREATE OR REPLACE FUNCTION claim_gift_card_public(
  _code TEXT,
  _email TEXT,
  _first_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  bundle_id UUID,
  hotel_id TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ctb customer_treatment_bundles%ROWTYPE;
  _customer_id UUID;
BEGIN
  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  IF _email IS NULL OR length(trim(_email)) < 5 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;
  IF _ctb.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift code already claimed';
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  -- Find existing customer by email, or create one
  SELECT id INTO _customer_id
  FROM customers
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (email, first_name, profile_completed)
    VALUES (lower(trim(_email)), _first_name, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN QUERY
  SELECT _ctb.id, _ctb.hotel_id, 'claimed'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_gift_card_public(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
