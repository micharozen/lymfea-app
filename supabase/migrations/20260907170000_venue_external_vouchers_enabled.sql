-- =========================================================================
-- external_vouchers_enabled — la saisie d'un bon revendeur se décide par lieu
-- =========================================================================
-- Tous les établissements ne travaillent pas avec Wonderbox / Smartbox. Sans
-- réglage, le champ « J'ai un bon cadeau » s'afficherait à l'étape Paiement de
-- chaque site de réservation, y compris là où aucun bon ne sera jamais
-- enregistré : le client saisirait un code qui ne peut pas exister.
--
-- Le drapeau est donc à false par défaut — la fonctionnalité n'ayant jamais été
-- livrée côté client, aucun lieu ne perd quoi que ce soit — et chaque lieu
-- l'active depuis l'onglet Bons cadeaux de sa fiche.
--
-- NOTE : migration écrite à la main, comme 20260904100000 et 20260907120000.
-- =========================================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS external_vouchers_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hotels.external_vouchers_enabled IS
  'Autorise la saisie d''un bon revendeur (Wonderbox, Smartbox…) sur le site de réservation client. Faux par défaut : le champ reste masqué et lookup_external_voucher refuse la recherche.';

-- -------------------------------------------------------------------------
-- Garde serveur : masquer le champ ne suffit pas, la RPC est ouverte à `anon`.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lookup_external_voucher(
  _hotel_id text,
  _code text,
  _attempt_key text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _attempts integer;
  _ctb customer_treatment_bundles%ROWTYPE;
  _reseller_name text;
  _remaining integer;
  _enabled boolean;
BEGIN
  -- Même normalisation que `normalizeVoucherCode` côté TypeScript : un bon
  -- enregistré par le lieu avec des tirets doit être retrouvé sans.
  _normalized := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));

  IF length(_normalized) < 4 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;
  IF _attempt_key IS NULL OR length(_attempt_key) < 3 THEN
    RAISE EXCEPTION 'Missing attempt key';
  END IF;

  -- Lieu qui n'accepte pas les bons revendeurs : on sort avant toute lecture du
  -- stock de bons, et sans consommer de tentative.
  SELECT external_vouchers_enabled INTO _enabled
  FROM hotels
  WHERE id = _hotel_id;

  IF NOT COALESCE(_enabled, false) THEN
    RETURN json_build_object('found', false, 'reason', 'disabled');
  END IF;

  -- Même garde-fou anti-énumération que lookup_gift_card_by_code, et la même
  -- file d'audit : 10 recherches par clé et par tranche de 5 minutes.
  SELECT COUNT(*) INTO _attempts
  FROM gift_code_attempts
  WHERE attempt_key = _attempt_key
    AND created_at > now() - interval '5 minutes';

  IF _attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts, please retry later';
  END IF;

  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  -- Un bon est rattaché à un lieu : le code d'un autre établissement reste
  -- introuvable ici, l'index unique porte d'ailleurs sur (hotel_id, code).
  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE hotel_id = _hotel_id
    AND origin = 'external'
    AND external_code_normalized = _normalized
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false, 'reason', 'not_found');
  END IF;

  UPDATE gift_code_attempts
  SET succeeded = true
  WHERE id = (
    SELECT id FROM gift_code_attempts
    WHERE attempt_key = _attempt_key
    ORDER BY created_at DESC
    LIMIT 1
  );

  -- Les motifs sont distincts de 'not_found' : un bon expiré ou déjà consommé
  -- appelle un message précis, sinon le client croit avoir mal saisi son code.
  IF _ctb.expires_at < CURRENT_DATE THEN
    RETURN json_build_object('found', false, 'reason', 'expired',
                             'expires_at', _ctb.expires_at);
  END IF;
  IF _ctb.status <> 'active' THEN
    RETURN json_build_object('found', false, 'reason', 'depleted');
  END IF;

  _remaining := coalesce(_ctb.total_amount_cents, 0) - coalesce(_ctb.used_amount_cents, 0);
  IF _remaining <= 0 THEN
    RETURN json_build_object('found', false, 'reason', 'depleted');
  END IF;

  SELECT name INTO _reseller_name
  FROM voucher_resellers
  WHERE id = _ctb.reseller_id;

  RETURN json_build_object(
    'found', true,
    'customer_bundle_id', _ctb.id,
    'reseller_name', _reseller_name,
    'remaining_amount_cents', _remaining,
    'expires_at', _ctb.expires_at
  );
END;
$$;

-- -------------------------------------------------------------------------
-- Exposition aux RPC publiques : le site client lit le lieu par ces deux
-- fonctions, jamais la table `hotels` directement.
-- -------------------------------------------------------------------------

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
  "out_of_hours_surcharge_percent" numeric,
  "client_payment_mode" text,
  "cancellation_policy_text_fr" text,
  "cancellation_policy_text_en" text,
  "cancellation_tiers" jsonb,
  "client_cancellation_cutoff_hours" numeric,
  "external_vouchers_enabled" boolean
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
    COALESCE(h.out_of_hours_surcharge_percent, 0),
    COALESCE(h.client_payment_mode, 'pre_authorization'),
    h.cancellation_policy_text_fr,
    h.cancellation_policy_text_en,
    COALESCE(h.cancellation_tiers, '[]'::jsonb),
    COALESCE(h.client_cancellation_cutoff_hours, 2),
    COALESCE(h.external_vouchers_enabled, false)
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
  "out_of_hours_surcharge_percent" numeric,
  "client_payment_mode" text,
  "cancellation_policy_text_fr" text,
  "cancellation_policy_text_en" text,
  "cancellation_tiers" jsonb,
  "client_cancellation_cutoff_hours" numeric,
  "external_vouchers_enabled" boolean
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
    COALESCE(h.out_of_hours_surcharge_percent, 0),
    COALESCE(h.client_payment_mode, 'pre_authorization'),
    h.cancellation_policy_text_fr,
    h.cancellation_policy_text_en,
    COALESCE(h.cancellation_tiers, '[]'::jsonb),
    COALESCE(h.client_cancellation_cutoff_hours, 2),
    COALESCE(h.external_vouchers_enabled, false)
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
