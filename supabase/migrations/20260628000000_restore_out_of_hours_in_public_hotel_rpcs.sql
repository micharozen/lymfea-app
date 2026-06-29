-- Restore out-of-hours booking config to the public hotel RPCs.
-- allow_out_of_hours_booking + out_of_hours_surcharge_percent were exposed in
-- 20260424090000_expose_out_of_hours_to_client.sql but accidentally dropped when
-- 20260601120000_venue_branding.sql redefined get_public_hotel_by_id/get_public_hotel.
-- Without them the client schedule step always reads allowOutOfHours=false, so no
-- out-of-hours slots or surcharge ever show, regardless of the venue setting.

DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  "id" text,
  "slug" text,
  "name" text,
  "name_en" text,
  "organization_name" text,
  "website_url" text,
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
  "contact_email" text,
  "welcome_background_color" text,
  "welcome_background_opacity" smallint,
  "button_color" text,
  "button_text_color" text,
  "font_title_url" text,
  "font_title_family" text,
  "font_body_url" text,
  "font_body_family" text,
  "booking_hold_enabled" boolean,
  "booking_hold_duration_minutes" integer,
  "allow_out_of_hours_booking" boolean,
  "out_of_hours_surcharge_percent" numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.slug,
    h.name,
    h.name_en,
    o.name,
    h.website_url,
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
    h.contact_email,
    vb.welcome_background_color, vb.welcome_background_opacity,
    vb.button_color,
    vb.button_text_color,
    vb.font_title_url,
    vb.font_title_family,
    vb.font_body_url,
    vb.font_body_family,
    COALESCE(h.booking_hold_enabled, true),
    COALESCE(h.booking_hold_duration_minutes, 5),
    COALESCE(h.allow_out_of_hours_booking, false),
    COALESCE(h.out_of_hours_surcharge_percent, 0)
  FROM public.hotels h
  LEFT JOIN public.organizations o ON o.id = h.organization_id
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  LEFT JOIN public.venue_branding vb ON vb.hotel_id = h.id
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

DROP FUNCTION IF EXISTS public.get_public_hotel(text);

CREATE FUNCTION public.get_public_hotel(_identifier text)
RETURNS TABLE(
  "id" text,
  "slug" text,
  "name" text,
  "name_en" text,
  "organization_name" text,
  "website_url" text,
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
  "contact_email" text,
  "welcome_background_color" text,
  "welcome_background_opacity" smallint,
  "button_color" text,
  "button_text_color" text,
  "font_title_url" text,
  "font_title_family" text,
  "font_body_url" text,
  "font_body_family" text,
  "booking_hold_enabled" boolean,
  "booking_hold_duration_minutes" integer,
  "allow_out_of_hours_booking" boolean,
  "out_of_hours_surcharge_percent" numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.slug,
    h.name,
    h.name_en,
    o.name,
    h.website_url,
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
    h.contact_email,
    vb.welcome_background_color, vb.welcome_background_opacity,
    vb.button_color,
    vb.button_text_color,
    vb.font_title_url,
    vb.font_title_family,
    vb.font_body_url,
    vb.font_body_family,
    COALESCE(h.booking_hold_enabled, true),
    COALESCE(h.booking_hold_duration_minutes, 5),
    COALESCE(h.allow_out_of_hours_booking, false),
    COALESCE(h.out_of_hours_surcharge_percent, 0)
  FROM public.hotels h
  LEFT JOIN public.organizations o ON o.id = h.organization_id
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  LEFT JOIN public.venue_branding vb ON vb.hotel_id = h.id
  LEFT JOIN LATERAL (
    SELECT (c.country_code || ' ' || c.phone) AS contact_phone
    FROM public.concierges c
    WHERE c.hotel_id = h.id
      AND LOWER(c.status) IN ('active', 'actif')
    ORDER BY c.created_at ASC
    LIMIT 1
  ) con ON true
  WHERE (
    (_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND h.id = _identifier)
    OR h.slug = _identifier
  )
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO service_role;
