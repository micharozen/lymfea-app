-- Migration: add human-readable slug to treatment_menus (per-hotel unique)
-- Deep-link URL /client/:slug/treatment/:treatmentId (UUID) becomes
-- /client/:slug/treatment/:treatmentSlug (e.g. /client/ritz-paris/treatment/massage-suedois-60).
-- Uniqueness is scoped per hotel — two venues can both have "massage-60".

ALTER TABLE public.treatment_menus ADD COLUMN IF NOT EXISTS slug text;

-- Generate a unique slug for a given hotel, suffixing -2, -3, ... if needed
CREATE OR REPLACE FUNCTION public.generate_unique_treatment_slug(
  _hotel_id text,
  _base text,
  _exclude_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate text;
  n integer := 1;
BEGIN
  base_slug := public.slugify(_base);
  IF base_slug IS NULL OR LENGTH(base_slug) < 2 THEN
    base_slug := 'treatment';
  END IF;

  candidate := base_slug;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.treatment_menus
      WHERE hotel_id = _hotel_id
        AND slug = candidate
        AND (_exclude_id IS NULL OR id <> _exclude_id)
    ) THEN
      RETURN candidate;
    END IF;
    n := n + 1;
    candidate := LEFT(base_slug, 58) || '-' || n::text;
  END LOOP;
END;
$$;

-- Backfill existing rows
UPDATE public.treatment_menus
SET slug = public.generate_unique_treatment_slug(hotel_id, name, id)
WHERE slug IS NULL;

ALTER TABLE public.treatment_menus
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.treatment_menus
  ADD CONSTRAINT treatment_menus_hotel_slug_key UNIQUE (hotel_id, slug);

ALTER TABLE public.treatment_menus
  ADD CONSTRAINT treatment_menus_slug_pattern_check
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND LENGTH(slug) BETWEEN 2 AND 60);

-- Auto-generate slug on insert when omitted
CREATE OR REPLACE FUNCTION public.treatment_menus_autofill_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR LENGTH(TRIM(NEW.slug)) = 0 THEN
    NEW.slug := public.generate_unique_treatment_slug(NEW.hotel_id, NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treatment_menus_autofill_slug_trigger ON public.treatment_menus;
CREATE TRIGGER treatment_menus_autofill_slug_trigger
  BEFORE INSERT ON public.treatment_menus
  FOR EACH ROW
  EXECUTE FUNCTION public.treatment_menus_autofill_slug();

-- Extend get_public_treatments to expose slug
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid,
  slug text,
  name text,
  name_en text,
  description text,
  description_en text,
  category text,
  service_for text,
  duration integer,
  price numeric,
  price_on_request boolean,
  lead_time integer,
  image text,
  sort_order integer,
  currency text,
  is_bestseller boolean,
  is_addon boolean,
  is_bundle boolean,
  bundle_id uuid,
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
    t.slug,
    t.name,
    t.name_en,
    t.description,
    t.description_en,
    t.category,
    t.service_for,
    t.duration,
    t.price,
    t.price_on_request,
    t.lead_time,
    t.image,
    t.sort_order,
    t.currency,
    t.is_bestseller,
    (COALESCE(t.is_addon, false) OR COALESCE(tc.is_addon, false)) AS is_addon,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'label_en', v.label_en,
            'duration', v.duration,
            'price', v.price,
            'price_on_request', v.price_on_request,
            'is_default', v.is_default,
            'sort_order', v.sort_order
          ) ORDER BY v.sort_order, v.duration
        )
        FROM public.treatment_variants v
        WHERE v.treatment_id = t.id
          AND v.status = 'active'
      ),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;
