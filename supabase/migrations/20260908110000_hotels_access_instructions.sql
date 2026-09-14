-- Informations d'accès du lieu (code porte, étage, chemin depuis l'entrée).
-- Distinctes de `address`, qui alimente le lien Google Maps et le footer des
-- e-mails : y mélanger un texte d'accès casserait l'itinéraire.
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS access_instructions text,
  ADD COLUMN IF NOT EXISTS access_instructions_en text;

COMMENT ON COLUMN public.hotels.access_instructions IS
  'Instructions d''accès (FR) affichées dans l''e-mail de confirmation client : code porte, étage, chemin depuis l''entrée.';

COMMENT ON COLUMN public.hotels.access_instructions_en IS
  'Instructions d''accès (EN). Repli sur access_instructions quand vide.';
