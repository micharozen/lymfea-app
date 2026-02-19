-- Migration: Add new Lymfea tables and extend treatment_menus
-- New tables: customers (persistent client profiles), treatment_packages, package_treatments
-- New columns on treatment_menus: requires_room, treatment_type
-- New FK on bookings: customer_id → customers

-- ============================================
-- 1. Extend treatment_menus
-- ============================================
ALTER TABLE treatment_menus ADD COLUMN IF NOT EXISTS requires_room BOOLEAN DEFAULT false;
ALTER TABLE treatment_menus ADD COLUMN IF NOT EXISTS treatment_type TEXT;

COMMENT ON COLUMN treatment_menus.requires_room IS 'Whether this treatment requires a dedicated treatment room/cabin';
COMMENT ON COLUMN treatment_menus.treatment_type IS 'Treatment category: body, face, wellness, etc.';

-- ============================================
-- 2. customers table — persistent customer profiles
-- Currently customer info is denormalized in bookings (client_first_name, client_last_name,
-- client_email, phone). This table centralizes customer data and enables history,
-- preferences, and health notes tracking.
-- Bookings will reference customers via customer_id FK.
-- Booking-specific fields stay on bookings: room_number, client_note, client_signature.
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  preferred_therapist_id UUID REFERENCES therapists(id) ON DELETE SET NULL,
  preferred_treatment_type TEXT,
  health_notes TEXT,
  language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE customers IS 'Persistent customer profiles with treatment history and preferences';
COMMENT ON COLUMN customers.health_notes IS 'Health notes, allergies, contraindications for spa treatments';
COMMENT ON COLUMN customers.language IS 'Preferred language for communications (fr or en)';

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_preferred_therapist ON customers(preferred_therapist_id) WHERE preferred_therapist_id IS NOT NULL;

-- RLS policies for customers
CREATE POLICY "Admins can manage customers" ON customers
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view customers" ON customers
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Therapists can view customers" ON customers
  FOR SELECT USING (has_role(auth.uid(), 'therapist'::app_role));

CREATE POLICY "Block anonymous access to customers" ON customers
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON customers TO anon, authenticated, service_role;

-- ============================================
-- 3. Add customer_id FK on bookings
-- Nullable for backward compatibility — existing bookings have no customer record yet.
-- The denormalized fields (client_first_name, etc.) stay for now (Phase B cleanup).
-- ============================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_customer ON bookings(customer_id) WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN bookings.customer_id IS 'Reference to persistent customer profile. Denormalized client_* fields kept for backward compat.';

-- ============================================
-- 4. treatment_packages — multi-treatment packages
-- (half-day spa, full-day, couples package, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS treatment_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  total_duration INTEGER,
  total_price NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'active' NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE treatment_packages IS 'Multi-treatment packages (half-day spa, couples package, etc.)';

ALTER TABLE treatment_packages ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_treatment_packages_updated_at
  BEFORE UPDATE ON treatment_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_treatment_packages_hotel ON treatment_packages(hotel_id);

-- RLS policies for treatment_packages
CREATE POLICY "Admins can manage packages" ON treatment_packages
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view active packages" ON treatment_packages
  FOR SELECT USING (status = 'active');

GRANT ALL ON treatment_packages TO anon, authenticated, service_role;

-- ============================================
-- 5. package_treatments — junction: package ↔ treatment
-- ============================================
CREATE TABLE IF NOT EXISTS package_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES treatment_packages(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES treatment_menus(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE package_treatments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_package_treatments_package ON package_treatments(package_id);
CREATE INDEX idx_package_treatments_treatment ON package_treatments(treatment_id);

-- RLS policies for package_treatments
CREATE POLICY "Admins can manage package treatments" ON package_treatments
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view package treatments" ON package_treatments
  FOR SELECT USING (true);

GRANT ALL ON package_treatments TO anon, authenticated, service_role;
