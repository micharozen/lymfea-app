-- Cap d'Antibes Beach Hôtel : les auto-factures des thérapeutes doivent être
-- adressées à l'hôtel et non à la plateforme (LYMFA CENTER / EÏA SAS).
--
-- 1. Profil de facturation du lieu (lu par generate-therapist-invoices pour les
--    lieux listés dans INVOICE_CLIENT_IS_VENUE_HOTEL_IDS).
-- 2. Réécriture du destinataire sur les factures déjà émises : seul le bloc
--    « Client ou Cliente » du HTML figé est remplacé, les montants, numéros et
--    dates restent intacts.

INSERT INTO public.billing_profiles (
  owner_type, owner_id, company_name, siret,
  billing_address, billing_postal_code, billing_city, billing_country
)
SELECT
  'hotel',
  '7a33f87a-5751-41ac-998d-0596d9eeda08',
  'Cap d''Antibes Beach Hôtel',
  '44358313300022',
  '10 Bd Maréchal Juin',
  '06160',
  'Antibes',
  'France'
WHERE EXISTS (
  SELECT 1 FROM public.hotels WHERE id = '7a33f87a-5751-41ac-998d-0596d9eeda08'
)
ON CONFLICT (owner_type, owner_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  siret = EXCLUDED.siret,
  billing_address = EXCLUDED.billing_address,
  billing_postal_code = EXCLUDED.billing_postal_code,
  billing_city = EXCLUDED.billing_city,
  billing_country = EXCLUDED.billing_country,
  updated_at = now();

UPDATE public.invoices
SET
  client_type = 'hotel',
  client_id = '7a33f87a-5751-41ac-998d-0596d9eeda08',
  client_snapshot = jsonb_build_object(
    'issuerName', 'Cap d''Antibes Beach Hôtel',
    'companyName', 'Cap d''Antibes Beach Hôtel',
    'companyType', '',
    'capital', '',
    'siren', '443583133',
    'vatNumber', '',
    'address', '10 Bd Maréchal Juin, 06160 Antibes, France'
  ),
  html_snapshot = regexp_replace(
    html_snapshot,
    -- NB : tous les quantificateurs sont non-greedy (\s*?). Dans les regex
    -- Postgres, la préférence du PREMIER quantificateur s'applique à toute
    -- l'expression : un \s* greedy en tête rendrait le .*? suivant greedy et
    -- avalerait la fin du document.
    '(<div class="party-label">Client ou Cliente</div>\s*?<div class="party-name">).*?(</div>\s*?<div class="party-lines">).*?</div>',
    '\1Cap d&#039;Antibes Beach Hôtel\2' ||
    E'\n          10 Bd Maréchal Juin<br>06160 Antibes<br>France<br>SIREN 443583133\n        </div>'
  ),
  updated_at = now()
WHERE invoice_kind = 'therapist_commission'
  AND hotel_id = '7a33f87a-5751-41ac-998d-0596d9eeda08'
  AND html_snapshot IS NOT NULL;
