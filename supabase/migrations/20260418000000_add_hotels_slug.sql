-- Migration: add human-readable slug to hotels for clean public URLs
-- /client/:hotelId (UUID) becomes /client/:slug (e.g. /client/le-ritz-paris)
-- Slugs are unique globally, editable, and auto-generated from name on insert.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Helper: slugify arbitrary text
-- unaccent → lowercase → non-alnum to "-" → collapse repeats → trim → truncate 60
CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    LEFT(
      TRIM(BOTH '-' FROM
        REGEXP_REPLACE(
          LOWER(public.unaccent(COALESCE(_input, ''))),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      60
    )
$$;

ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS slug text;

-- Generate a unique slug for a hotel, suffixing -2, -3, ... if needed
CREATE OR REPLACE FUNCTION public.generate_unique_hotel_slug(
  _base text,
  _exclude_id text DEFAULT NULL
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
    base_slug := 'venue';
  END IF;

  candidate := base_slug;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.hotels
      WHERE slug = candidate
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
UPDATE public.hotels
SET slug = public.generate_unique_hotel_slug(name, id)
WHERE slug IS NULL;

ALTER TABLE public.hotels
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_slug_key UNIQUE (slug);

ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_slug_pattern_check
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND LENGTH(slug) BETWEEN 2 AND 60);

-- Auto-generate slug on insert when omitted
CREATE OR REPLACE FUNCTION public.hotels_autofill_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR LENGTH(TRIM(NEW.slug)) = 0 THEN
    NEW.slug := public.generate_unique_hotel_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotels_autofill_slug_trigger ON public.hotels;
CREATE TRIGGER hotels_autofill_slug_trigger
  BEFORE INSERT ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.hotels_autofill_slug();
