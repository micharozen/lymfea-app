-- Client cancellation tiers + configurable online cutoff per venue.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS client_cancellation_cutoff_hours NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS cancellation_tiers JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.hotels.client_cancellation_cutoff_hours IS
  'Minimum hours before appointment for client self-cancellation via manage link.';
COMMENT ON COLUMN public.hotels.cancellation_tiers IS
  'Client refund tiers: [{ max_hours, min_hours, refund_percent }]. Hours before appointment.';

-- Extend public hotel RPC (preserve prior return columns + cancellation config).
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "name" text,
  "name_en" text,
  "image" text,
  "cover_image" text,
  "address" text,
  "postal_code" text,
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
  "pms_guest_lookup_enabled" boolean,
  "booking_hold_enabled" boolean,
  "booking_hold_duration_minutes" integer,
  "allow_out_of_hours_booking" boolean,
  "out_of_hours_surcharge_percent" numeric,
  "contact_phone" text,
  "client_cancellation_cutoff_hours" numeric,
  "cancellation_tiers" jsonb,
  "timezone" text
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
    h.address,
    h.postal_code,
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
    COALESCE(h.pms_guest_lookup_enabled, false),
    COALESCE(h.booking_hold_enabled, true),
    COALESCE(h.booking_hold_duration_minutes, 5),
    COALESCE(h.allow_out_of_hours_booking, false),
    COALESCE(h.out_of_hours_surcharge_percent, 0),
    con.contact_phone,
    COALESCE(h.client_cancellation_cutoff_hours, 2),
    COALESCE(h.cancellation_tiers, '[]'::jsonb),
    COALESCE(h.timezone, 'UTC')
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  LEFT JOIN LATERAL (
    SELECT (c.country_code || ' ' || c.phone) AS contact_phone
    FROM public.concierges c
    WHERE c.hotel_id = h.id
      AND LOWER(c.status) IN ('active', 'actif')
    ORDER BY c.created_at ASC
    LIMIT 1
  ) con ON true
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel_by_id(text) TO service_role;
