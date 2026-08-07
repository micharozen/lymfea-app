-- Destinataire des auto-factures thérapeutes, réglable par lieu.
--
-- Remplace la liste codée en dur INVOICE_CLIENT_IS_VENUE_HOTEL_IDS de
-- generate-therapist-invoices : ajouter un lieu qui facture en direct ne
-- demande plus de redéploiement.
--
--   'organization' (défaut) — la facture est adressée à l'organisation
--                             propriétaire du lieu (LYMFA CENTER / EÏA SAS).
--   'venue'                 — la facture est adressée au lieu lui-même, avec
--                             son profil de facturation (billing_profiles,
--                             owner_type = 'hotel') et, à défaut, les
--                             coordonnées de sa fiche.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS invoice_client text NOT NULL DEFAULT 'organization';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_invoice_client_check'
  ) THEN
    ALTER TABLE public.hotels
      ADD CONSTRAINT hotels_invoice_client_check
      CHECK (invoice_client IN ('organization', 'venue'));
  END IF;
END $$;

COMMENT ON COLUMN public.hotels.invoice_client IS
  'Destinataire des auto-factures thérapeutes : organization (défaut) ou venue.';

-- Reprend le seul lieu jusqu'ici traité en dur par l'edge function.
UPDATE public.hotels
SET invoice_client = 'venue'
WHERE id = '7a33f87a-5751-41ac-998d-0596d9eeda08';
