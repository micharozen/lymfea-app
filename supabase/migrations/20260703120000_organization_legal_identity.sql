-- Migration: Organization legal identity (invoice issuer)
-- The invoice ISSUER (émetteur) is the organization; the recipient is the
-- venue (commission invoice) or the therapist (auto-invoice).
--
-- These columns hold the organization's own legal identity, most of which can
-- be auto-filled from the SIREN via the public API recherche-entreprises.api.gouv.fr
-- (see edge function `lookup-company`). Kept nullable: the invoice functions fall
-- back to _shared/brand.json legal block per field until an organization is filled.
-- No backfill: existing legal values were placeholders and must be re-entered via
-- the admin UI so they can be validated against INSEE.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS commercial_name    TEXT,  -- nom commercial (displayed brand name)
  ADD COLUMN IF NOT EXISTS legal_name         TEXT,  -- raison sociale (INSEE nom_raison_sociale)
  ADD COLUMN IF NOT EXISTS legal_form         TEXT,  -- forme juridique label (e.g. "SAS")
  ADD COLUMN IF NOT EXISTS legal_capital      TEXT,  -- capital social, formatted (e.g. "1 258,57 €") — manual, not in the API
  ADD COLUMN IF NOT EXISTS siren              TEXT,
  ADD COLUMN IF NOT EXISTS siret              TEXT,  -- SIRET of the head office (siège)
  ADD COLUMN IF NOT EXISTS rcs                TEXT,
  ADD COLUMN IF NOT EXISTS vat_number         TEXT,  -- N° TVA intracommunautaire (computed from SIREN)
  ADD COLUMN IF NOT EXISTS legal_address      TEXT,  -- street line
  ADD COLUMN IF NOT EXISTS legal_postal_code  TEXT,
  ADD COLUMN IF NOT EXISTS legal_city         TEXT,
  ADD COLUMN IF NOT EXISTS legal_country      TEXT DEFAULT 'France',
  ADD COLUMN IF NOT EXISTS legal_synced_at    TIMESTAMPTZ;  -- last successful INSEE lookup

COMMENT ON COLUMN organizations.commercial_name IS 'Nom commercial displayed on invoices (may differ from INSEE raison sociale)';
COMMENT ON COLUMN organizations.legal_name       IS 'Raison sociale from INSEE (nom_raison_sociale)';
COMMENT ON COLUMN organizations.vat_number       IS 'N° TVA intracommunautaire, computed from SIREN: FR + ((12 + 3*(SIREN mod 97)) mod 97) + SIREN';
COMMENT ON COLUMN organizations.legal_synced_at  IS 'Timestamp of the last successful lookup against recherche-entreprises.api.gouv.fr';
