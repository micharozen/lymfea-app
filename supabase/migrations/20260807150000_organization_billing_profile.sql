-- Profil de facturation de l'organisation, dans billing_profiles.
--
-- L'identité de l'organisation qui apparaît sur les factures (destinataire des
-- auto-factures thérapeutes, émetteur des factures de lieu) vivait dans les
-- colonnes organizations.legal_*, sans aucun écran de saisie. Elle rejoint
-- billing_profiles, comme les thérapeutes et les lieux, avec un formulaire
-- unique.
--
-- Les colonnes organizations.legal_* sont conservées le temps du déploiement
-- (les edge functions les lisent encore jusqu'à la mise en ligne) et seront
-- supprimées dans une migration ultérieure pour éviter deux sources.

ALTER TABLE public.billing_profiles
  DROP CONSTRAINT IF EXISTS billing_profiles_owner_type_check;

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_owner_type_check
  CHECK (owner_type IN ('therapist', 'hotel', 'organization'));

-- Deux champs portés par organizations.legal_* et absents de billing_profiles :
-- le nom commercial (affiché en tête de facture, distinct de la raison sociale)
-- et le capital social (mentions légales du pied de page).
ALTER TABLE public.billing_profiles
  ADD COLUMN IF NOT EXISTS commercial_name text,
  ADD COLUMN IF NOT EXISTS legal_capital text;

COMMENT ON COLUMN public.billing_profiles.commercial_name IS
  'Nom commercial affiché en tête de facture ; à défaut, company_name.';
COMMENT ON COLUMN public.billing_profiles.legal_capital IS
  'Capital social, repris dans les mentions légales du pied de facture.';

-- Reprise des organisations existantes.
INSERT INTO public.billing_profiles (
  owner_type, owner_id, commercial_name, company_name, legal_form, legal_capital,
  siren, siret, tva_number,
  billing_address, billing_postal_code, billing_city, billing_country
)
SELECT
  'organization',
  o.id::text,
  NULLIF(TRIM(COALESCE(o.commercial_name, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_name, o.commercial_name, o.name, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_form, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_capital, '')), ''),
  NULLIF(TRIM(COALESCE(o.siren, '')), ''),
  NULLIF(TRIM(COALESCE(o.siret, '')), ''),
  NULLIF(TRIM(COALESCE(o.vat_number, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_address, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_postal_code, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_city, '')), ''),
  NULLIF(TRIM(COALESCE(o.legal_country, 'France')), '')
FROM public.organizations o
ON CONFLICT (owner_type, owner_id) DO NOTHING;

-- Les admins gèrent déjà billing_profiles (policy "Admins can manage
-- billing_profiles", ALL) : aucune policy supplémentaire n'est requise.
