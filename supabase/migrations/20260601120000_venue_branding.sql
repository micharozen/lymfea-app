-- Per-venue branding customization for client booking flow.
-- Stores colors + per-text-type fonts in a dedicated 1:1 table to keep `hotels` lean
-- and allow future expansion (sizes, weights, additional palette tokens...).
-- Updates the public RPCs get_public_hotel_by_id + get_public_hotel to expose these fields
-- (both used in /client/:slug, anonymous).

CREATE TABLE IF NOT EXISTS public.venue_branding (
  hotel_id text PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  welcome_background_color text,
  welcome_background_opacity smallint CHECK (welcome_background_opacity BETWEEN 0 AND 100),
  button_color text,
  button_text_color text,
  font_title_url text,
  font_title_family text,
  font_body_url text,
  font_body_family text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_branding IS '1:1 with hotels — visual customization of the client booking flow (colors + custom fonts).';
COMMENT ON COLUMN public.venue_branding.welcome_background_color IS 'Hex color for the client Welcome page hero overlay. NULL = use default gradient.';
COMMENT ON COLUMN public.venue_branding.button_color IS 'Hex color for primary CTA buttons. NULL = default gold-400.';
COMMENT ON COLUMN public.venue_branding.button_text_color IS 'Hex color for text inside primary CTA buttons. NULL = default black.';
COMMENT ON COLUMN public.venue_branding.font_title_url IS 'Public URL (Supabase Storage) of the title font file (woff2/woff/ttf/otf).';
COMMENT ON COLUMN public.venue_branding.font_title_family IS 'CSS font-family name to register the title font under (used in @font-face).';
COMMENT ON COLUMN public.venue_branding.font_body_url IS 'Public URL (Supabase Storage) of the body font file (woff2/woff/ttf/otf).';
COMMENT ON COLUMN public.venue_branding.font_body_family IS 'CSS font-family name to register the body font under (used in @font-face).';

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.venue_branding_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venue_branding_updated_at ON public.venue_branding;
CREATE TRIGGER venue_branding_updated_at
  BEFORE UPDATE ON public.venue_branding
  FOR EACH ROW EXECUTE FUNCTION public.venue_branding_set_updated_at();

-- RLS: admins / concierges of the venue can read+write; client flow reads via security-definer RPCs.
ALTER TABLE public.venue_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_branding admin read" ON public.venue_branding;
CREATE POLICY "venue_branding admin read" ON public.venue_branding
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  );

DROP POLICY IF EXISTS "venue_branding admin write" ON public.venue_branding;
CREATE POLICY "venue_branding admin write" ON public.venue_branding
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  );

-- Public RPCs: expose branding via LEFT JOIN so anon clients can fetch.
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
  "welcome_background_opacity" smallint,
  "button_color" text,
  "button_text_color" text,
  "font_title_url" text,
  "font_title_family" text,
  "font_body_url" text,
  "font_body_family" text
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
    vb.welcome_background_color, vb.welcome_background_opacity,
    vb.button_color,
    vb.button_text_color,
    vb.font_title_url,
    vb.font_title_family,
    vb.font_body_url,
    vb.font_body_family
  FROM public.hotels h
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
  "welcome_background_opacity" smallint,
  "button_color" text,
  "button_text_color" text,
  "font_title_url" text,
  "font_title_family" text,
  "font_body_url" text,
  "font_body_family" text
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
    vb.welcome_background_color, vb.welcome_background_opacity,
    vb.button_color,
    vb.button_text_color,
    vb.font_title_url,
    vb.font_title_family,
    vb.font_body_url,
    vb.font_body_family
  FROM public.hotels h
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
