-- Add public venue contact email needed by the client confirmation page.
-- contact_email is public contact information displayed next to the venue
-- address in client-facing venue confirmation screens.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN public.hotels.contact_email IS
  'Public venue contact email displayed in client-facing venue confirmation screens.';

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
    COALESCE(h.booking_hold_duration_minutes, 5)
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
    COALESCE(h.booking_hold_duration_minutes, 5)
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

CREATE OR REPLACE FUNCTION public.get_booking_summary(_booking_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', b.id,
    'booking_date', b.booking_date,
    'booking_time', b.booking_time,
    'room_number', b.room_number,
    'status', b.status,
    'payment_method', b.payment_method,
    'payment_status', b.payment_status,
    'payment_link_language', b.payment_link_language,
    'booking_group_id', b.booking_group_id,
    'client_first_name', b.client_first_name,
    'hotels', (
      SELECT json_build_object(
        'name', h.name,
        'organization_name', o.name,
        'website_url', h.website_url,
        'address', h.address,
        'postal_code', h.postal_code,
        'city', h.city,
        'country', h.country,
        'contact_email', h.contact_email
      )
      FROM public.hotels h
      LEFT JOIN public.organizations o ON o.id = h.organization_id
      WHERE h.id = b.hotel_id
    ),
    'treatments', COALESCE(
      (
        SELECT json_agg(tm.name)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      '[]'::json
    ),
    'group_siblings', CASE
      WHEN b.booking_group_id IS NOT NULL THEN (
        SELECT json_agg(
          json_build_object(
            'id', s.id,
            'booking_date', s.booking_date,
            'booking_time', s.booking_time,
            'treatment_name', COALESCE(
              (
                SELECT string_agg(tm.name, ', ' ORDER BY tm.name)
                FROM booking_treatments bt
                JOIN treatment_menus tm ON tm.id = bt.treatment_id
                WHERE bt.booking_id = s.id
              ),
              '—'
            )
          )
          ORDER BY s.booking_date, s.booking_time
        )
        FROM bookings s
        WHERE s.booking_group_id = b.booking_group_id
      )
      ELSE NULL
    END
  )
  FROM bookings b
  WHERE b.id = _booking_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO service_role;
