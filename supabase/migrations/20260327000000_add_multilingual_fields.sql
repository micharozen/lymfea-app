-- Add multilingual (English) fields for client-facing content
-- French remains the default (existing name/description columns), English is optional

-- 1. Hotels: name_en, landing_subtitle_en, description_en
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS landing_subtitle_en text;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS description_en text;

-- 2. Treatment menus: name_en, description_en
ALTER TABLE public.treatment_menus ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.treatment_menus ADD COLUMN IF NOT EXISTS description_en text;

-- 3. Treatment categories: name_en
ALTER TABLE public.treatment_categories ADD COLUMN IF NOT EXISTS name_en text;

-- 4. Treatment variants: label_en
ALTER TABLE public.treatment_variants ADD COLUMN IF NOT EXISTS label_en text;

-- 5. Update get_public_hotel_by_id to include _en fields
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "name" text,
  "name_en" text,
  "image" text,
  "cover_image" text,
  "city" text,
  "country" text,
  "currency" text,
  "status" text,
  "vat" numeric,
  "opening_time" time without time zone,
  "closing_time" time without time zone,
  "schedule_type" text,
  "days_of_week" integer[],
  "recurrence_interval" integer,
  "recurring_start_date" date,
  "recurring_end_date" date,
  "venue_type" text,
  "description" text,
  "description_en" text,
  "landing_subtitle" text,
  "landing_subtitle_en" text,
  "offert" boolean,
  "slot_interval" integer,
  "company_offered" boolean,
  "pms_guest_lookup_enabled" boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.name,
    h.name_en,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status,
    h.vat,
    h.opening_time,
    h.closing_time,
    vds.schedule_type::text,
    vds.days_of_week,
    COALESCE(vds.recurrence_interval, 1),
    vds.recurring_start_date,
    vds.recurring_end_date,
    h.venue_type,
    h.description,
    h.description_en,
    h.landing_subtitle,
    h.landing_subtitle_en,
    COALESCE(h.offert, false),
    COALESCE(h.slot_interval, 30),
    COALESCE(h.company_offered, false),
    COALESCE(h.pms_guest_lookup_enabled, false)
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO service_role;

-- 6. Update get_public_treatments to include _en fields
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid,
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
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
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
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;
