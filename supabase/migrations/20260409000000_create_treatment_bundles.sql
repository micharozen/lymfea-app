-- Migration: Treatment Bundles (Cures / Forfaits de Soins)
-- New tables: treatment_bundles, treatment_bundle_items, customer_treatment_bundles, bundle_session_usages
-- New columns on bookings: bundle_usage_id
-- New columns on treatment_menus: is_bundle, bundle_id
-- RPC functions: detect_bundles_for_booking, use_bundle_session, create_customer_bundle, expire_overdue_bundles

-- ============================================
-- 1. treatment_bundles — bundle templates
-- ============================================
CREATE TABLE IF NOT EXISTS treatment_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  description_en TEXT,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  currency TEXT DEFAULT 'EUR',
  validity_days INTEGER DEFAULT 365,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE treatment_bundles IS 'Bundle/cure templates: N sessions of eligible treatments sold as a package';

ALTER TABLE treatment_bundles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_treatment_bundles_updated_at
  BEFORE UPDATE ON treatment_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_treatment_bundles_hotel ON treatment_bundles(hotel_id);
CREATE INDEX idx_treatment_bundles_status ON treatment_bundles(status);

-- RLS policies for treatment_bundles
CREATE POLICY "Public can view active bundles" ON treatment_bundles
  FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can manage bundles" ON treatment_bundles
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view bundles" ON treatment_bundles
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role));

GRANT ALL ON treatment_bundles TO anon, authenticated, service_role;

-- ============================================
-- 2. treatment_bundle_items — junction: bundle ↔ treatment_menus
-- ============================================
CREATE TABLE IF NOT EXISTS treatment_bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES treatment_bundles(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES treatment_menus(id) ON DELETE CASCADE,
  UNIQUE (bundle_id, treatment_id)
);

COMMENT ON TABLE treatment_bundle_items IS 'Junction table: which treatments are eligible for a given bundle';

ALTER TABLE treatment_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_treatment_bundle_items_bundle ON treatment_bundle_items(bundle_id);
CREATE INDEX idx_treatment_bundle_items_treatment ON treatment_bundle_items(treatment_id);

-- RLS policies for treatment_bundle_items
CREATE POLICY "Public can view bundle items" ON treatment_bundle_items
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage bundle items" ON treatment_bundle_items
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

GRANT ALL ON treatment_bundle_items TO anon, authenticated, service_role;

-- ============================================
-- 3. customer_treatment_bundles — sold bundles
-- ============================================
CREATE TABLE IF NOT EXISTS customer_treatment_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES treatment_bundles(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  used_sessions INTEGER NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  notes TEXT,
  sold_by UUID,
  payment_reference TEXT,
  booking_id UUID REFERENCES bookings(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_used_le_total CHECK (used_sessions <= total_sessions)
);

COMMENT ON TABLE customer_treatment_bundles IS 'Sold bundles: tracks sessions used/remaining per customer';
COMMENT ON COLUMN customer_treatment_bundles.booking_id IS 'Reference to the purchase booking (client bought the cure as a treatment)';
COMMENT ON COLUMN customer_treatment_bundles.sold_by IS 'UUID of the admin/concierge who sold it manually (NULL if purchased online)';

ALTER TABLE customer_treatment_bundles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_customer_treatment_bundles_updated_at
  BEFORE UPDATE ON customer_treatment_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_customer_bundles_bundle ON customer_treatment_bundles(bundle_id);
CREATE INDEX idx_customer_bundles_customer ON customer_treatment_bundles(customer_id);
CREATE INDEX idx_customer_bundles_hotel ON customer_treatment_bundles(hotel_id);
CREATE INDEX idx_customer_bundles_booking ON customer_treatment_bundles(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_customer_bundles_active ON customer_treatment_bundles(customer_id, hotel_id) WHERE status = 'active';

-- RLS policies for customer_treatment_bundles
CREATE POLICY "Admins can manage customer bundles" ON customer_treatment_bundles
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view customer bundles" ON customer_treatment_bundles
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Concierges can insert customer bundles" ON customer_treatment_bundles
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Therapists can view customer bundles" ON customer_treatment_bundles
  FOR SELECT USING (has_role(auth.uid(), 'therapist'::app_role));

CREATE POLICY "Block anonymous access to customer bundles" ON customer_treatment_bundles
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON customer_treatment_bundles TO anon, authenticated, service_role;

-- ============================================
-- 4. bundle_session_usages — usage history
-- ============================================
CREATE TABLE IF NOT EXISTS bundle_session_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_bundle_id UUID NOT NULL REFERENCES customer_treatment_bundles(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE SET NULL,
  treatment_id UUID NOT NULL REFERENCES treatment_menus(id) ON DELETE RESTRICT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

COMMENT ON TABLE bundle_session_usages IS 'Tracks each session usage: which booking consumed a bundle credit';

ALTER TABLE bundle_session_usages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bundle_usages_customer_bundle ON bundle_session_usages(customer_bundle_id);
CREATE INDEX idx_bundle_usages_booking ON bundle_session_usages(booking_id);
CREATE INDEX idx_bundle_usages_treatment ON bundle_session_usages(treatment_id);

-- RLS policies for bundle_session_usages
CREATE POLICY "Admins can manage bundle usages" ON bundle_session_usages
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view bundle usages" ON bundle_session_usages
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Therapists can view bundle usages" ON bundle_session_usages
  FOR SELECT USING (has_role(auth.uid(), 'therapist'::app_role));

CREATE POLICY "Block anonymous access to bundle usages" ON bundle_session_usages
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON bundle_session_usages TO anon, authenticated, service_role;

-- ============================================
-- 5. Add bundle_usage_id on bookings
-- ============================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS bundle_usage_id UUID
  REFERENCES bundle_session_usages(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_bundle_usage ON bookings(bundle_usage_id) WHERE bundle_usage_id IS NOT NULL;

COMMENT ON COLUMN bookings.bundle_usage_id IS 'Reference to bundle session usage if this booking consumed a cure credit';

-- ============================================
-- 6. Add is_bundle and bundle_id on treatment_menus
-- ============================================
ALTER TABLE treatment_menus ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN DEFAULT false;
ALTER TABLE treatment_menus ADD COLUMN IF NOT EXISTS bundle_id UUID
  REFERENCES treatment_bundles(id) ON DELETE SET NULL;

CREATE INDEX idx_treatment_menus_bundle ON treatment_menus(bundle_id) WHERE bundle_id IS NOT NULL;

COMMENT ON COLUMN treatment_menus.is_bundle IS 'True if this treatment represents a bundle/cure purchase in the client flow';
COMMENT ON COLUMN treatment_menus.bundle_id IS 'Reference to the bundle template this treatment represents';

-- ============================================
-- 7. RPC: detect_bundles_for_booking
-- Returns active bundles with remaining sessions for a customer (identified by phone)
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
  -- Normalize phone: strip spaces, dashes, dots
  _normalized_phone := regexp_replace(trim(_phone), '[\s\-\.]', '', 'g');

  -- Find customer by phone
  SELECT c.id INTO _customer_id
  FROM customers c
  WHERE regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g') = _normalized_phone
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
  WHERE ctb.customer_id = _customer_id
    AND ctb.hotel_id = _hotel_id
    AND ctb.status = 'active'
    AND ctb.expires_at >= CURRENT_DATE
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

COMMENT ON FUNCTION detect_bundles_for_booking IS 'Finds active bundles for a customer by phone number, optionally filtered by treatment IDs';

GRANT EXECUTE ON FUNCTION detect_bundles_for_booking(TEXT, TEXT, UUID[]) TO anon, authenticated, service_role;

-- ============================================
-- 8. RPC: use_bundle_session
-- Consumes one session from a customer bundle, linked to a booking
-- ============================================
CREATE OR REPLACE FUNCTION use_bundle_session(
  _customer_bundle_id UUID,
  _booking_id UUID,
  _treatment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bundle customer_treatment_bundles%ROWTYPE;
  _bundle_template_id UUID;
  _is_eligible BOOLEAN;
  _usage_id UUID;
BEGIN
  -- Lock the customer bundle row to prevent race conditions
  SELECT * INTO _bundle
  FROM customer_treatment_bundles
  WHERE id = _customer_bundle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer bundle not found: %', _customer_bundle_id;
  END IF;

  IF _bundle.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle is not active (status: %)', _bundle.status;
  END IF;

  IF _bundle.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Bundle has expired (expires_at: %)', _bundle.expires_at;
  END IF;

  IF _bundle.used_sessions >= _bundle.total_sessions THEN
    RAISE EXCEPTION 'No remaining sessions on this bundle';
  END IF;

  -- Verify treatment is eligible for this bundle
  SELECT EXISTS (
    SELECT 1 FROM treatment_bundle_items
    WHERE bundle_id = _bundle.bundle_id
      AND treatment_id = _treatment_id
  ) INTO _is_eligible;

  IF NOT _is_eligible THEN
    RAISE EXCEPTION 'Treatment % is not eligible for this bundle', _treatment_id;
  END IF;

  -- Create the usage record
  INSERT INTO bundle_session_usages (customer_bundle_id, booking_id, treatment_id)
  VALUES (_customer_bundle_id, _booking_id, _treatment_id)
  RETURNING id INTO _usage_id;

  -- Increment used_sessions
  UPDATE customer_treatment_bundles
  SET used_sessions = used_sessions + 1,
      updated_at = now()
  WHERE id = _customer_bundle_id;

  -- Auto-complete if all sessions used
  IF _bundle.used_sessions + 1 >= _bundle.total_sessions THEN
    UPDATE customer_treatment_bundles
    SET status = 'completed',
        updated_at = now()
    WHERE id = _customer_bundle_id;
  END IF;

  -- Link the booking to this usage
  UPDATE bookings
  SET bundle_usage_id = _usage_id
  WHERE id = _booking_id;

  RETURN _usage_id;
END;
$$;

COMMENT ON FUNCTION use_bundle_session IS 'Consumes one session from a customer bundle with row-level locking to prevent race conditions';

GRANT EXECUTE ON FUNCTION use_bundle_session(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- ============================================
-- 9. RPC: create_customer_bundle
-- Creates a sold bundle entry for a customer
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

  INSERT INTO customer_treatment_bundles (
    bundle_id, customer_id, hotel_id,
    total_sessions, expires_at, booking_id
  )
  VALUES (
    _bundle_id, _customer_id, _hotel_id,
    _template.total_sessions,
    CURRENT_DATE + _template.validity_days,
    _booking_id
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

COMMENT ON FUNCTION create_customer_bundle IS 'Creates a customer bundle entry with expiry calculated from the template validity_days';

GRANT EXECUTE ON FUNCTION create_customer_bundle(UUID, UUID, TEXT, UUID) TO anon, authenticated, service_role;

-- ============================================
-- 10. RPC: expire_overdue_bundles
-- Expires active bundles past their expiration date
-- ============================================
CREATE OR REPLACE FUNCTION expire_overdue_bundles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INTEGER;
BEGIN
  UPDATE customer_treatment_bundles
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at < CURRENT_DATE;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

COMMENT ON FUNCTION expire_overdue_bundles IS 'Expires active bundles past their expiration date. Intended for daily cron execution.';

GRANT EXECUTE ON FUNCTION expire_overdue_bundles() TO authenticated, service_role;
