-- Per-venue configuration for the booking hold flow (draft booking TTL).
-- Allows each hotel to enable/disable the hold and set the countdown duration.
-- Adds hold_expires_at on bookings so the cleanup cron can delete expired drafts
-- without relying on the client-side countdown (which can be bypassed).

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS booking_hold_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_hold_duration_minutes integer NOT NULL DEFAULT 5;

ALTER TABLE public.hotels
  DROP CONSTRAINT IF EXISTS hotels_booking_hold_duration_range;

ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_booking_hold_duration_range
    CHECK (booking_hold_duration_minutes BETWEEN 1 AND 15);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires_at
  ON public.bookings (hold_expires_at)
  WHERE status = 'awaiting_payment' AND hold_expires_at IS NOT NULL;

-- Extend get_public_hotel_by_id with the two new fields so the client booking
-- flow (anonymous) can read them and decide whether to trigger the hold.
DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "slug" text,
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
  "pms_guest_lookup_enabled" boolean,
  "address" text,
  "postal_code" text,
  "contact_phone" text,
  "booking_hold_enabled" boolean,
  "booking_hold_duration_minutes" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.slug,
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
    COALESCE(h.pms_guest_lookup_enabled, false),
    h.address,
    h.postal_code,
    con.contact_phone,
    COALESCE(h.booking_hold_enabled, true),
    COALESCE(h.booking_hold_duration_minutes, 5)
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

-- pg_cron job: delete draft bookings whose server-side TTL has elapsed.
-- The .eq status = 'awaiting_payment' guard mirrors the client-side invariant
-- in FlowContext.cancelHold (never touch bookings already promoted to pending).
-- Cascaded rows (booking_treatments, booking_payment_infos, booking_therapists)
-- are cleaned up via ON DELETE CASCADE declared in baseline + subsequent migs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-expired-draft-bookings',
      '* * * * *',
      $sql$
        DELETE FROM public.bookings
        WHERE status = 'awaiting_payment'
          AND hold_expires_at IS NOT NULL
          AND hold_expires_at < NOW()
      $sql$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping draft cleanup schedule (created on hosted Supabase)';
  END IF;
END;
$$;
