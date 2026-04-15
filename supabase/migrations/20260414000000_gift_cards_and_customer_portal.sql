-- Migration: Gift Cards + Customer Portal
-- Extends treatment_bundles with gift_cards (two types: treatments or amount).
-- Adds customer portal auth wiring on the customers table.
-- New RPCs: detect_gift_cards_for_booking, lookup_gift_card_by_code, claim_gift_card,
-- use_gift_amount, generate_gift_redemption_code, merge_customer_profiles.
-- Updates detect_bundles_for_booking to filter on beneficiary_customer_id.

-- ============================================
-- 1. treatment_bundles — gift card extensions
-- ============================================
ALTER TABLE treatment_bundles
  ADD COLUMN IF NOT EXISTS bundle_type TEXT NOT NULL DEFAULT 'cure'
    CHECK (bundle_type IN ('cure', 'gift_treatments', 'gift_amount'));

ALTER TABLE treatment_bundles
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER
    CHECK (amount_cents IS NULL OR amount_cents > 0);

ALTER TABLE treatment_bundles ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE treatment_bundles ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE treatment_bundles ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE treatment_bundles
  ADD COLUMN IF NOT EXISTS display_on_client_flow BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN treatment_bundles.bundle_type IS
  'cure = multi-session package, gift_treatments = gift card for N sessions, gift_amount = gift card for a monetary amount';
COMMENT ON COLUMN treatment_bundles.amount_cents IS
  'Monetary value for gift_amount bundles (in cents). Required iff bundle_type = gift_amount';
COMMENT ON COLUMN treatment_bundles.title IS 'Marketing title for gift cards (displayed on the card visual and email)';
COMMENT ON COLUMN treatment_bundles.cover_image_url IS 'Visual image for the gift card (shown in client flow and embedded in the email)';

-- Shape constraint: gift_amount needs amount_cents, otherwise it must be NULL
ALTER TABLE treatment_bundles
  DROP CONSTRAINT IF EXISTS chk_bundle_amount_shape;
ALTER TABLE treatment_bundles
  ADD CONSTRAINT chk_bundle_amount_shape CHECK (
    (bundle_type = 'gift_amount' AND amount_cents IS NOT NULL)
    OR (bundle_type <> 'gift_amount' AND amount_cents IS NULL)
  );

-- Cures always need at least one session; gift_amount does not use total_sessions
ALTER TABLE treatment_bundles ALTER COLUMN total_sessions DROP NOT NULL;
ALTER TABLE treatment_bundles DROP CONSTRAINT IF EXISTS treatment_bundles_total_sessions_check;
ALTER TABLE treatment_bundles
  ADD CONSTRAINT chk_bundle_sessions_shape CHECK (
    (bundle_type IN ('cure', 'gift_treatments') AND total_sessions IS NOT NULL AND total_sessions > 0)
    OR (bundle_type = 'gift_amount' AND total_sessions IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_treatment_bundles_type ON treatment_bundles(hotel_id, bundle_type);

-- ============================================
-- 2. customer_treatment_bundles — gift card extensions
-- ============================================

-- beneficiary_customer_id: the customer who uses the bundle.
-- For cures and self-purchased gift cards: equals customer_id.
-- For gift cards destined to another person: NULL until claimed, then filled.
ALTER TABLE customer_treatment_bundles
  ADD COLUMN IF NOT EXISTS beneficiary_customer_id UUID
  REFERENCES customers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_customer_bundles_beneficiary
  ON customer_treatment_bundles(beneficiary_customer_id)
  WHERE beneficiary_customer_id IS NOT NULL;

-- Backfill existing rows: beneficiary = purchaser for cures
UPDATE customer_treatment_bundles
SET beneficiary_customer_id = customer_id
WHERE beneficiary_customer_id IS NULL;

-- Make total_sessions nullable for gift_amount bundles
ALTER TABLE customer_treatment_bundles ALTER COLUMN total_sessions DROP NOT NULL;
ALTER TABLE customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS customer_treatment_bundles_total_sessions_check;
ALTER TABLE customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS check_used_le_total;

-- Monetary fields (for gift_amount bundles only)
ALTER TABLE customer_treatment_bundles
  ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER
    CHECK (total_amount_cents IS NULL OR total_amount_cents > 0);
ALTER TABLE customer_treatment_bundles
  ADD COLUMN IF NOT EXISTS used_amount_cents INTEGER NOT NULL DEFAULT 0
    CHECK (used_amount_cents >= 0);

-- Session shape + amount shape constraints (scoped by bundle_type later via app layer)
ALTER TABLE customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_used_le_total_sessions CHECK (
    total_sessions IS NULL OR used_sessions <= total_sessions
  );
ALTER TABLE customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_used_le_total_amount CHECK (
    total_amount_cents IS NULL OR used_amount_cents <= total_amount_cents
  );

-- Gift card metadata
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer_treatment_bundles
  ADD COLUMN IF NOT EXISTS gift_delivery_mode TEXT
    CHECK (gift_delivery_mode IS NULL OR gift_delivery_mode IN ('email', 'print'));
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS redemption_code TEXT;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE customer_treatment_bundles ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Unique redemption code (partial index, only for gift rows)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctb_redemption_code
  ON customer_treatment_bundles(redemption_code)
  WHERE redemption_code IS NOT NULL;

ALTER TABLE customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS chk_ctb_gift_shape;
ALTER TABLE customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_gift_shape CHECK (
    (is_gift = false AND redemption_code IS NULL AND gift_delivery_mode IS NULL)
    OR (is_gift = true AND redemption_code IS NOT NULL AND gift_delivery_mode IS NOT NULL)
  );

COMMENT ON COLUMN customer_treatment_bundles.beneficiary_customer_id IS
  'Customer who can consume this bundle. Same as customer_id for cures and self-purchased gifts. NULL for gifts awaiting claim.';
COMMENT ON COLUMN customer_treatment_bundles.redemption_code IS
  'Public 10-char code used by the beneficiary to claim the gift at /portal/redeem';

-- ============================================
-- 3. bundle_amount_usages — audit trail for gift_amount consumption
-- ============================================
CREATE TABLE IF NOT EXISTS bundle_amount_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_bundle_id UUID NOT NULL REFERENCES customer_treatment_bundles(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount_cents_used INTEGER NOT NULL CHECK (amount_cents_used > 0),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, customer_bundle_id)
);

COMMENT ON TABLE bundle_amount_usages IS 'Audit trail for each redemption of a gift_amount bundle on a booking';

ALTER TABLE bundle_amount_usages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bundle_amount_usages_bundle ON bundle_amount_usages(customer_bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_amount_usages_booking ON bundle_amount_usages(booking_id);

CREATE POLICY "Admins can manage amount usages" ON bundle_amount_usages
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view amount usages" ON bundle_amount_usages
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Therapists can view amount usages" ON bundle_amount_usages
  FOR SELECT USING (has_role(auth.uid(), 'therapist'::app_role));

CREATE POLICY "Block anonymous access to amount usages" ON bundle_amount_usages
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON bundle_amount_usages TO anon, authenticated, service_role;

-- bookings: track how much of a gift_amount card was applied
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gift_amount_applied_cents INTEGER NOT NULL DEFAULT 0
    CHECK (gift_amount_applied_cents >= 0);

COMMENT ON COLUMN bookings.gift_amount_applied_cents IS
  'Portion of the booking price paid via a gift_amount card redemption';

-- ============================================
-- 4. customers — portal auth + nullable profile fields
-- ============================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_auth_user_id
  ON customers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Relax NOT NULL constraints: a portal account may be created before the onboarding
-- step has supplied phone / first_name. Application logic flips profile_completed = true
-- once all required fields are populated.
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN first_name DROP NOT NULL;

-- Mark all pre-existing rows as profile_completed = true (they were created by admin/booking flow)
UPDATE customers SET profile_completed = true WHERE profile_completed = false;

COMMENT ON COLUMN customers.auth_user_id IS
  'Supabase Auth user linked to this customer profile (client portal). Unique when not NULL.';
COMMENT ON COLUMN customers.profile_completed IS
  'False during portal onboarding until first_name + phone have been supplied by the customer.';

-- Customers can read/update their own profile via the portal
CREATE POLICY "Customers can view their own profile" ON customers
  FOR SELECT
  USING (auth_user_id IS NOT NULL AND auth_user_id = auth.uid());

CREATE POLICY "Customers can update their own profile" ON customers
  FOR UPDATE
  USING (auth_user_id IS NOT NULL AND auth_user_id = auth.uid())
  WITH CHECK (auth_user_id IS NOT NULL AND auth_user_id = auth.uid());

-- Customers can read their own bundles + amount usages
CREATE POLICY "Customers can view their own bundles" ON customer_treatment_bundles
  FOR SELECT
  USING (
    beneficiary_customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_treatment_bundles.beneficiary_customer_id
        AND c.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Purchasers can view their sent gifts" ON customer_treatment_bundles
  FOR SELECT
  USING (
    is_gift = true
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_treatment_bundles.customer_id
        AND c.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can view their own amount usages" ON bundle_amount_usages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM customer_treatment_bundles ctb
      JOIN customers c ON c.id = ctb.beneficiary_customer_id
      WHERE ctb.id = bundle_amount_usages.customer_bundle_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- ============================================
-- 5. gift_code_attempts — brute-force rate limiting for lookup
-- ============================================
CREATE TABLE IF NOT EXISTS gift_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_key TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE gift_code_attempts IS
  'Audit of lookup_gift_card_by_code calls for brute-force rate limiting. attempt_key = IP or session identifier.';

CREATE INDEX IF NOT EXISTS idx_gift_code_attempts_key_time
  ON gift_code_attempts(attempt_key, created_at DESC);

ALTER TABLE gift_code_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block direct access to gift code attempts" ON gift_code_attempts
  AS RESTRICTIVE TO anon, authenticated USING (false);

GRANT ALL ON gift_code_attempts TO service_role;

-- ============================================
-- 6. RPC: generate_gift_redemption_code (internal helper)
-- ============================================
CREATE OR REPLACE FUNCTION generate_gift_redemption_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  _alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no ambiguous 0/O/1/I
  _code TEXT;
  _i INTEGER;
  _exists BOOLEAN;
  _attempts INTEGER := 0;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..10 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;

    SELECT EXISTS (
      SELECT 1 FROM customer_treatment_bundles WHERE redemption_code = _code
    ) INTO _exists;

    EXIT WHEN NOT _exists;
    _attempts := _attempts + 1;
    IF _attempts >= 10 THEN
      RAISE EXCEPTION 'Failed to generate unique redemption code after 10 attempts';
    END IF;
  END LOOP;

  RETURN _code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_gift_redemption_code() TO authenticated, service_role;

-- ============================================
-- 7. RPC: detect_bundles_for_booking — now uses beneficiary_customer_id
-- ============================================
CREATE OR REPLACE FUNCTION detect_bundles_for_booking(
  _phone TEXT,
  _hotel_id TEXT,
  _treatment_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  customer_bundle_id UUID,
  bundle_name TEXT,
  bundle_name_en TEXT,
  total_sessions INTEGER,
  used_sessions INTEGER,
  remaining_sessions INTEGER,
  expires_at DATE,
  eligible_treatment_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized_phone TEXT;
  _customer_id UUID;
BEGIN
  _normalized_phone := regexp_replace(trim(_phone), '[\s\-\.]', '', 'g');

  SELECT c.id INTO _customer_id
  FROM customers c
  WHERE c.phone IS NOT NULL
    AND regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g') = _normalized_phone
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id AS customer_bundle_id,
    tb.name AS bundle_name,
    tb.name_en AS bundle_name_en,
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
  GROUP BY ctb.id, tb.name, tb.name_en, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
  HAVING (
    _treatment_ids IS NULL
    OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
  );
END;
$$;

-- ============================================
-- 8. RPC: detect_gift_cards_for_booking — monetary cards for a phone
-- ============================================
CREATE OR REPLACE FUNCTION detect_gift_cards_for_booking(
  _phone TEXT,
  _hotel_id TEXT
)
RETURNS TABLE (
  customer_bundle_id UUID,
  title TEXT,
  title_en TEXT,
  cover_image_url TEXT,
  total_amount_cents INTEGER,
  used_amount_cents INTEGER,
  remaining_amount_cents INTEGER,
  expires_at DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized_phone TEXT;
  _customer_id UUID;
BEGIN
  _normalized_phone := regexp_replace(trim(_phone), '[\s\-\.]', '', 'g');

  SELECT c.id INTO _customer_id
  FROM customers c
  WHERE c.phone IS NOT NULL
    AND regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g') = _normalized_phone
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id,
    tb.title,
    tb.title_en,
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
    AND ctb.used_amount_cents < ctb.total_amount_cents;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_gift_cards_for_booking(TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================
-- 9. RPC: lookup_gift_card_by_code — public preview before claim
-- Callers must pass an _attempt_key (IP / session) for rate limiting.
-- ============================================
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
  already_claimed BOOLEAN
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

  -- Record the attempt first (even failed ones count)
  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  SELECT id INTO _ctb_id
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
    AND is_gift = true
  LIMIT 1;

  IF _ctb_id IS NULL THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;

  SELECT * INTO _ctb FROM customer_treatment_bundles WHERE id = _ctb_id;
  SELECT * INTO _tb FROM treatment_bundles WHERE id = _ctb.bundle_id;

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
    (SELECT h.name FROM hotels h WHERE h.id = _ctb.hotel_id),
    (_ctb.claimed_at IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_gift_card_by_code(TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================
-- 10. RPC: claim_gift_card — authenticated beneficiary claims a code
-- ============================================
CREATE OR REPLACE FUNCTION claim_gift_card(
  _code TEXT,
  _email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID;
  _customer_id UUID;
  _ctb customer_treatment_bundles%ROWTYPE;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code AND is_gift = true
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

  -- Find or create the customers row for this auth user
  SELECT id INTO _customer_id FROM customers WHERE auth_user_id = _uid LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (auth_user_id, email, profile_completed)
    VALUES (_uid, _email, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN _ctb.id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_gift_card(TEXT, TEXT) TO authenticated, service_role;

-- ============================================
-- 11. RPC: use_gift_amount — debit a monetary gift card for a booking
-- ============================================
CREATE OR REPLACE FUNCTION use_gift_amount(
  _customer_bundle_id UUID,
  _booking_id UUID,
  _amount_cents INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ctb customer_treatment_bundles%ROWTYPE;
  _remaining INTEGER;
  _usage_id UUID;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE id = _customer_bundle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer bundle not found: %', _customer_bundle_id;
  END IF;
  IF _ctb.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle is not active (status: %)', _ctb.status;
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Bundle has expired';
  END IF;
  IF _ctb.total_amount_cents IS NULL THEN
    RAISE EXCEPTION 'This bundle is not a monetary gift card';
  END IF;

  _remaining := _ctb.total_amount_cents - _ctb.used_amount_cents;
  IF _amount_cents > _remaining THEN
    RAISE EXCEPTION 'Insufficient balance: requested % cents, remaining % cents', _amount_cents, _remaining;
  END IF;

  INSERT INTO bundle_amount_usages (customer_bundle_id, booking_id, amount_cents_used)
  VALUES (_customer_bundle_id, _booking_id, _amount_cents)
  RETURNING id INTO _usage_id;

  UPDATE customer_treatment_bundles
  SET used_amount_cents = used_amount_cents + _amount_cents,
      updated_at = now()
  WHERE id = _customer_bundle_id;

  IF _ctb.used_amount_cents + _amount_cents >= _ctb.total_amount_cents THEN
    UPDATE customer_treatment_bundles
    SET status = 'completed', updated_at = now()
    WHERE id = _customer_bundle_id;
  END IF;

  UPDATE bookings
  SET gift_amount_applied_cents = gift_amount_applied_cents + _amount_cents
  WHERE id = _booking_id;

  RETURN _usage_id;
END;
$$;

GRANT EXECUTE ON FUNCTION use_gift_amount(UUID, UUID, INTEGER) TO authenticated, service_role;

-- ============================================
-- 12. RPC: merge_customer_profiles — dedupe when onboarding finds an existing phone row
-- ============================================
CREATE OR REPLACE FUNCTION merge_customer_profiles(
  _new_customer_id UUID,
  _existing_customer_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID;
  _new_auth UUID;
  _existing_auth UUID;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT auth_user_id INTO _new_auth FROM customers WHERE id = _new_customer_id;
  IF _new_auth IS NULL OR _new_auth <> _uid THEN
    RAISE EXCEPTION 'Unauthorized merge';
  END IF;

  SELECT auth_user_id INTO _existing_auth FROM customers WHERE id = _existing_customer_id;
  IF _existing_auth IS NOT NULL AND _existing_auth <> _uid THEN
    RAISE EXCEPTION 'Target profile is already linked to a different account';
  END IF;

  UPDATE customer_treatment_bundles
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _existing_customer_id
  WHERE beneficiary_customer_id = _new_customer_id;

  UPDATE bookings
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customers
  SET auth_user_id = _uid,
      profile_completed = true,
      updated_at = now()
  WHERE id = _existing_customer_id;

  DELETE FROM customers WHERE id = _new_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION merge_customer_profiles(UUID, UUID) TO authenticated, service_role;

-- ============================================
-- 13. RPC: create_customer_bundle — updated to populate beneficiary_customer_id
-- Preserves the existing signature so that existing callers (SellBundleDialog, stripe webhook)
-- keep working. New signatures for gift card creation will live in a separate function.
-- ============================================
CREATE OR REPLACE FUNCTION create_customer_bundle(
  _customer_id UUID,
  _bundle_id UUID,
  _hotel_id TEXT,
  _booking_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template treatment_bundles%ROWTYPE;
  _new_id UUID;
BEGIN
  SELECT * INTO _template
  FROM treatment_bundles
  WHERE id = _bundle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle template not found: %', _bundle_id;
  END IF;

  IF _template.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle template is not active';
  END IF;

  IF _template.bundle_type <> 'cure' THEN
    RAISE EXCEPTION 'Use create_customer_gift_card for non-cure bundle types';
  END IF;

  INSERT INTO customer_treatment_bundles (
    bundle_id, customer_id, beneficiary_customer_id, hotel_id,
    total_sessions, expires_at, booking_id
  )
  VALUES (
    _bundle_id, _customer_id, _customer_id, _hotel_id,
    _template.total_sessions,
    CURRENT_DATE + _template.validity_days,
    _booking_id
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_customer_bundle(UUID, UUID, TEXT, UUID) TO anon, authenticated, service_role;

-- ============================================
-- 14. RPC: create_customer_gift_card — insert a sold gift card (online or manual)
-- Returns the new customer_treatment_bundles.id and the generated redemption_code.
-- ============================================
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

  IF _is_gift THEN
    IF _gift_delivery_mode IS NULL OR _gift_delivery_mode NOT IN ('email', 'print') THEN
      RAISE EXCEPTION 'Invalid gift_delivery_mode';
    END IF;
    IF _gift_delivery_mode = 'email' AND (_recipient_email IS NULL OR length(trim(_recipient_email)) = 0) THEN
      RAISE EXCEPTION 'recipient_email is required for email delivery';
    END IF;
    _beneficiary := NULL;
    _code := generate_gift_redemption_code();
  ELSE
    _beneficiary := _purchaser_customer_id;
    _code := NULL;
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
