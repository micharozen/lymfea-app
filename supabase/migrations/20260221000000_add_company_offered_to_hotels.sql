-- Add company_offered flag for venues where the company sponsors treatments for employees
-- When enabled, all prices are hidden from clients and payment is skipped (reuses offert booking logic)

ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS company_offered BOOLEAN DEFAULT false;

-- Update get_public_hotel_by_id to include company_offered
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "name" text,
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
  "landing_subtitle" text,
  "offert" boolean,
  "slot_interval" integer,
  "company_offered" boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.name,
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
    h.landing_subtitle,
    COALESCE(h.offert, false),
    COALESCE(h.slot_interval, 30),
    COALESCE(h.company_offered, false)
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO service_role;
