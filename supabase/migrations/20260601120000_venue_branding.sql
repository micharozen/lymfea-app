-- Per-venue branding customization for client booking flow
-- Adds: welcome background color, button color (bg + text), custom font (URL + family)
-- Updates the public RPCs get_public_hotel_by_id + get_public_hotel to expose these fields
-- (both used in /client/:slug, anonymous).

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS welcome_background_color text,
  ADD COLUMN IF NOT EXISTS button_color text,
  ADD COLUMN IF NOT EXISTS button_text_color text,
  ADD COLUMN IF NOT EXISTS custom_font_url text,
  ADD COLUMN IF NOT EXISTS custom_font_family text;

COMMENT ON COLUMN public.hotels.welcome_background_color IS 'Hex color (e.g. #F5F0E8) for the client Welcome page background. NULL = use default.';
COMMENT ON COLUMN public.hotels.button_color IS 'Hex color for primary CTA buttons in the client flow. NULL = use default gold-400.';
COMMENT ON COLUMN public.hotels.button_text_color IS 'Hex color for text inside primary CTA buttons. NULL = use default black.';
COMMENT ON COLUMN public.hotels.custom_font_url IS 'Public URL (Supabase Storage) of a custom font file (woff2/woff/ttf/otf) for the client flow.';
COMMENT ON COLUMN public.hotels.custom_font_family IS 'CSS font-family name to register the custom font under (used in @font-face).';

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
  "welcome_background_color" text,
  "button_color" text,
  "button_text_color" text,
  "custom_font_url" text,
  "custom_font_family" text
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
    h.welcome_background_color,
    h.button_color,
    h.button_text_color,
    h.custom_font_url,
    h.custom_font_family
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


DROP FUNCTION IF EXISTS public.get_public_hotel(text);

CREATE FUNCTION public.get_public_hotel(_identifier text)
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
  "welcome_background_color" text,
  "button_color" text,
  "button_text_color" text,
  "custom_font_url" text,
  "custom_font_family" text
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
    h.welcome_background_color,
    h.button_color,
    h.button_text_color,
    h.custom_font_url,
    h.custom_font_family
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
  WHERE (
    (_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND h.id = _identifier)
    OR h.slug = _identifier
  )
    AND LOWER(h.status) IN ('active', 'actif');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hotel(text) TO service_role;


-- Storage bucket for custom venue fonts (public read; writes gated by RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-fonts', 'venue-fonts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read venue fonts" ON storage.objects;
CREATE POLICY "Public read venue fonts" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'venue-fonts');

DROP POLICY IF EXISTS "Admins upload venue fonts" ON storage.objects;
CREATE POLICY "Admins upload venue fonts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'venue-fonts'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'concierge'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins update venue fonts" ON storage.objects;
CREATE POLICY "Admins update venue fonts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'venue-fonts'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'concierge'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins delete venue fonts" ON storage.objects;
CREATE POLICY "Admins delete venue fonts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'venue-fonts'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'concierge'::public.app_role)
    )
  );
