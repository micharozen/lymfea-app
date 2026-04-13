-- Migration: Billing profiles and generic invoices table
-- Adds:
--   1. billing_profiles — polymorphic billing info for therapists (and later hotels)
--   2. invoices — generic invoice table (therapist_commission today, hotel_commission later)
--   3. invoice_number_seq — sequence for invoice numbers

-- ============================================
-- 1. billing_profiles — polymorphic billing info
-- Used for both therapists (auto-facturation: therapist → Lymfea)
-- and, later, hotels (facturation: Lymfea → hotel)
-- ============================================
CREATE TABLE IF NOT EXISTS billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('therapist', 'hotel')),
  -- TEXT (not UUID) because it may reference therapists.id (UUID) or hotels.id (TEXT);
  -- UUIDs cast cleanly to TEXT so this works for both.
  owner_id TEXT NOT NULL,

  -- Legal identity
  company_name TEXT,
  legal_form TEXT,
  siret TEXT,
  siren TEXT,
  tva_number TEXT,
  vat_exempt BOOLEAN NOT NULL DEFAULT false,

  -- Address
  billing_address TEXT,
  billing_postal_code TEXT,
  billing_city TEXT,
  billing_country TEXT DEFAULT 'France',
  contact_email TEXT,
  contact_phone TEXT,

  -- Bank details
  iban TEXT,
  bic TEXT,
  bank_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id)
);

COMMENT ON TABLE billing_profiles IS 'Polymorphic billing info for therapists and hotels (used for invoice generation)';
COMMENT ON COLUMN billing_profiles.owner_type IS 'Target entity type: therapist or hotel';
COMMENT ON COLUMN billing_profiles.owner_id IS 'Logical FK to therapists.id or hotels.id (resolved by owner_type)';
COMMENT ON COLUMN billing_profiles.vat_exempt IS 'VAT exemption (art. 293 B du CGI) — typically auto-entrepreneurs';

CREATE INDEX idx_billing_profiles_owner ON billing_profiles(owner_type, owner_id);

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_billing_profiles_updated_at
  BEFORE UPDATE ON billing_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: Admins manage all billing profiles
CREATE POLICY "Admins can manage billing_profiles" ON billing_profiles
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Therapists can view their own billing profile
CREATE POLICY "Therapists can view own billing_profile" ON billing_profiles
  FOR SELECT USING (
    owner_type = 'therapist'
    AND owner_id = (SELECT id FROM therapists WHERE user_id = auth.uid())
  );

-- RLS: Block anonymous access
CREATE POLICY "Block anonymous access to billing_profiles" ON billing_profiles
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON billing_profiles TO anon, authenticated, service_role;

-- ============================================
-- 2. invoice_number_seq — global sequence for invoice numbers
-- ============================================
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

GRANT USAGE ON SEQUENCE invoice_number_seq TO anon, authenticated, service_role;

-- Helper RPC to get the next invoice number in the "F-YYYY-NNNNNN" format
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_val BIGINT;
  year_part TEXT;
BEGIN
  seq_val := nextval('invoice_number_seq');
  year_part := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'F-' || year_part || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_invoice_number() TO authenticated, service_role;

-- ============================================
-- 3. invoices — generic invoice table
-- Kinds supported:
--   'therapist_commission' : self-billed invoice Lymfea → therapist (this session)
--   'hotel_commission'     : invoice Lymfea → hotel (future session)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  invoice_kind TEXT NOT NULL CHECK (invoice_kind IN ('therapist_commission', 'hotel_commission')),

  -- Polymorphic issuer / client — TEXT to hold either a therapist UUID or a hotel text id
  issuer_type TEXT NOT NULL CHECK (issuer_type IN ('therapist', 'hotel', 'lymfea')),
  issuer_id TEXT,
  client_type TEXT NOT NULL CHECK (client_type IN ('therapist', 'hotel', 'lymfea')),
  client_id TEXT,

  -- Business attachments (both set for therapist commission)
  therapist_id UUID REFERENCES therapists(id) ON DELETE SET NULL,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,

  -- Numbering & dates
  invoice_number TEXT NOT NULL UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,

  -- Amounts
  amount_ht NUMERIC(10,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20,
  vat_amount NUMERIC(10,2) NOT NULL,
  amount_ttc NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  bookings_count INTEGER NOT NULL DEFAULT 0,

  -- Immutable snapshots at generation time
  html_snapshot TEXT,
  issuer_snapshot JSONB,
  client_snapshot JSONB,
  metadata JSONB,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One invoice per (kind, therapist, hotel, period)
  UNIQUE (invoice_kind, therapist_id, hotel_id, period_start)
);

COMMENT ON TABLE invoices IS 'Generic invoice table supporting multiple kinds (therapist commission, hotel commission)';
COMMENT ON COLUMN invoices.invoice_kind IS 'therapist_commission (Lymfea→therapist) | hotel_commission (Lymfea→hotel)';
COMMENT ON COLUMN invoices.html_snapshot IS 'Frozen HTML document generated at creation time';
COMMENT ON COLUMN invoices.issuer_snapshot IS 'Frozen copy of issuer billing profile at generation time';
COMMENT ON COLUMN invoices.client_snapshot IS 'Frozen copy of client billing profile at generation time';

CREATE INDEX idx_invoices_therapist ON invoices(therapist_id) WHERE therapist_id IS NOT NULL;
CREATE INDEX idx_invoices_hotel ON invoices(hotel_id) WHERE hotel_id IS NOT NULL;
CREATE INDEX idx_invoices_period ON invoices(period_start);
CREATE INDEX idx_invoices_kind ON invoices(invoice_kind);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: Admins manage all invoices
CREATE POLICY "Admins can manage invoices" ON invoices
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Therapists can view their own invoices
CREATE POLICY "Therapists can view own invoices" ON invoices
  FOR SELECT USING (
    therapist_id = (SELECT id FROM therapists WHERE user_id = auth.uid())
  );

-- RLS: Block anonymous access
CREATE POLICY "Block anonymous access to invoices" ON invoices
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON invoices TO anon, authenticated, service_role;
