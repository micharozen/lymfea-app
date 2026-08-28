-- Le slug auto-généré d'un soin part du nom anglais quand il existe, sinon du nom français.
-- Filet de sécurité côté DB : le front pré-remplit déjà le champ "Lien public" avec la même règle.
-- Pas de backfill : les slugs existants restent inchangés pour ne pas casser les URLs publiques.

CREATE OR REPLACE FUNCTION public.treatment_menus_autofill_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR LENGTH(TRIM(NEW.slug)) = 0 THEN
    NEW.slug := public.generate_unique_treatment_slug(
      NEW.hotel_id,
      COALESCE(NULLIF(TRIM(NEW.name_en), ''), NEW.name),
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
