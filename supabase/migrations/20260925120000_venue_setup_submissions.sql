-- =========================================================================
-- Venue setup wizard (public onboarding link /setup/:token)
-- =========================================================================
-- A venue fills a public wizard; answers are stored as JSON, keyed by
-- table/column names. Nothing touches business tables until a super-admin
-- reviews the submission and runs import_venue_setup_submission(), which
-- writes ONLY into the submission's organization.
--
-- Public access goes exclusively through the venue-setup edge function
-- (service role). The table itself is super-admin only.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.venue_setup_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Kept in clear on purpose so the link can be copied again from the admin;
  -- the table is readable by super-admins only.
  token text NOT NULL UNIQUE
    DEFAULT translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'),
  label text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'imported', 'archived')),
  submitted_at timestamptz,
  imported_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  hotel_id text REFERENCES public.hotels(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_setup_submissions IS
  'Réponses du wizard public d''onboarding lieu (/setup/:token). data = JSON calqué sur les colonnes cibles ; import manuel via import_venue_setup_submission().';

CREATE INDEX IF NOT EXISTS venue_setup_submissions_org_idx
  ON public.venue_setup_submissions (organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_venue_setup_submissions_updated_at ON public.venue_setup_submissions;
CREATE TRIGGER update_venue_setup_submissions_updated_at
  BEFORE UPDATE ON public.venue_setup_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venue_setup_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage venue setup submissions" ON public.venue_setup_submissions;
CREATE POLICY "Super admins manage venue setup submissions"
  ON public.venue_setup_submissions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- -------------------------------------------------------------------------
-- Private bucket for files uploaded from the wizard (logos, cover, fonts).
-- Uploads use signed URLs issued by the edge function; super-admins read
-- them (signed URLs) to review and copy them to public buckets at import.
-- -------------------------------------------------------------------------

-- Size and type limits are enforced by Storage itself: the signed upload URL
-- does not bind the declared metadata to the bytes actually sent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-setup', 'venue-setup', false, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp',
        'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Super admins read venue setup files" ON storage.objects;
CREATE POLICY "Super admins read venue setup files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'venue-setup'
  AND public.is_super_admin(auth.uid())
);

-- -------------------------------------------------------------------------
-- Import RPC
-- -------------------------------------------------------------------------
-- p_file_urls maps each uploaded path (data.*_path) to its final public URL,
-- the caller having copied the files to public buckets beforehand.
-- Runs in a single transaction: any failure rolls back everything.
-- Returns { hotel_id, concierges: [{id, email, first_name, last_name, phone,
-- country_code}], linked_concierges: [email], skipped_concierges: [email] }
-- so the caller can send the invitations for the newly created ones.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_venue_setup_submission(
  p_submission_id uuid,
  p_file_urls jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub public.venue_setup_submissions%ROWTYPE;
  v_org_id uuid;
  v_data jsonb;
  v_org jsonb;
  v_obp jsonb;
  v_h jsonb;
  v_vbp jsonb;
  v_sched jsonb;
  v_brand jsonb;
  v_item jsonb;
  v_hotel_id text;
  v_hotel_name text;
  v_sub_row public.subscriptions%ROWTYPE;
  v_used integer;
  v_concierge_id uuid;
  v_concierges jsonb := '[]'::jsonb;
  v_existing_org uuid;
  v_linked jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub
  FROM public.venue_setup_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- A draft can be imported too (super-admin's call): the link locks as
  -- soon as the status leaves 'draft'.
  IF v_sub.status NOT IN ('draft', 'submitted') OR v_sub.hotel_id IS NOT NULL THEN
    RAISE EXCEPTION 'submission_not_importable (status=%)', v_sub.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_org_id := v_sub.organization_id;
  v_data   := v_sub.data;
  v_org    := COALESCE(v_data->'organization', '{}'::jsonb);
  v_obp    := v_data->'organization_billing_profile';
  v_h      := COALESCE(v_data->'hotel', '{}'::jsonb);
  v_vbp    := v_data->'venue_billing_profile';
  v_sched  := v_data->'venue_deployment_schedule';
  v_brand  := v_data->'venue_branding';

  v_hotel_name := NULLIF(trim(v_h->>'name'), '');
  IF v_hotel_name IS NULL THEN
    RAISE EXCEPTION 'hotel.name is required' USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Organization legal identity — never overwrite a value with an empty one.
  UPDATE public.organizations o SET
    commercial_name   = COALESCE(NULLIF(v_org->>'commercial_name', ''), o.commercial_name),
    legal_name        = COALESCE(NULLIF(v_org->>'legal_name', ''), o.legal_name),
    legal_form        = COALESCE(NULLIF(v_org->>'legal_form', ''), o.legal_form),
    legal_capital     = COALESCE(NULLIF(v_org->>'legal_capital', ''), o.legal_capital),
    siren             = COALESCE(NULLIF(v_org->>'siren', ''), o.siren),
    siret             = COALESCE(NULLIF(v_org->>'siret', ''), o.siret),
    rcs               = COALESCE(NULLIF(v_org->>'rcs', ''), o.rcs),
    vat_number        = COALESCE(NULLIF(v_org->>'vat_number', ''), o.vat_number),
    legal_address     = COALESCE(NULLIF(v_org->>'legal_address', ''), o.legal_address),
    legal_postal_code = COALESCE(NULLIF(v_org->>'legal_postal_code', ''), o.legal_postal_code),
    legal_city        = COALESCE(NULLIF(v_org->>'legal_city', ''), o.legal_city),
    legal_country     = COALESCE(NULLIF(v_org->>'legal_country', ''), o.legal_country),
    contact_email     = COALESCE(NULLIF(v_org->>'contact_email', ''), o.contact_email),
    logo_url          = COALESCE(p_file_urls->>(v_org->>'logo_path'), o.logo_url)
  WHERE o.id = v_org_id;

  INSERT INTO public.billing_profiles AS bp (
    owner_type, owner_id, commercial_name, company_name, legal_form, legal_capital,
    siren, siret, tva_number, billing_address, billing_postal_code, billing_city,
    billing_country, contact_email, contact_phone
  ) VALUES (
    'organization', v_org_id::text,
    NULLIF(v_org->>'commercial_name', ''), NULLIF(v_org->>'legal_name', ''),
    NULLIF(v_org->>'legal_form', ''), NULLIF(v_org->>'legal_capital', ''),
    NULLIF(v_org->>'siren', ''), NULLIF(v_org->>'siret', ''), NULLIF(v_org->>'vat_number', ''),
    COALESCE(NULLIF(v_obp->>'billing_address', ''), NULLIF(v_org->>'legal_address', '')),
    COALESCE(NULLIF(v_obp->>'billing_postal_code', ''), NULLIF(v_org->>'legal_postal_code', '')),
    COALESCE(NULLIF(v_obp->>'billing_city', ''), NULLIF(v_org->>'legal_city', '')),
    COALESCE(NULLIF(v_obp->>'billing_country', ''), NULLIF(v_org->>'legal_country', '')),
    NULLIF(v_obp->>'contact_email', ''), NULLIF(v_obp->>'contact_phone', '')
  )
  ON CONFLICT (owner_type, owner_id) DO UPDATE SET
    commercial_name     = COALESCE(EXCLUDED.commercial_name, bp.commercial_name),
    company_name        = COALESCE(EXCLUDED.company_name, bp.company_name),
    legal_form          = COALESCE(EXCLUDED.legal_form, bp.legal_form),
    legal_capital       = COALESCE(EXCLUDED.legal_capital, bp.legal_capital),
    siren               = COALESCE(EXCLUDED.siren, bp.siren),
    siret               = COALESCE(EXCLUDED.siret, bp.siret),
    tva_number          = COALESCE(EXCLUDED.tva_number, bp.tva_number),
    billing_address     = COALESCE(EXCLUDED.billing_address, bp.billing_address),
    billing_postal_code = COALESCE(EXCLUDED.billing_postal_code, bp.billing_postal_code),
    billing_city        = COALESCE(EXCLUDED.billing_city, bp.billing_city),
    billing_country     = COALESCE(EXCLUDED.billing_country, bp.billing_country),
    contact_email       = COALESCE(EXCLUDED.contact_email, bp.contact_email),
    contact_phone       = COALESCE(EXCLUDED.contact_phone, bp.contact_phone);

  -- 2. Seat capacity (enforce_hotel_seat_capacity trigger). A complimentary
  --    manual subscription is created or widened; a Stripe-billed one is
  --    never touched — the import fails with a clear message instead.
  SELECT count(*) INTO v_used FROM public.hotels WHERE organization_id = v_org_id;

  SELECT * INTO v_sub_row FROM public.subscriptions WHERE organization_id = v_org_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (
      organization_id, plan_id, stripe_customer_id, status, billing_cycle, seats, metadata
    ) VALUES (
      v_org_id,
      (SELECT id FROM public.plans WHERE code = 'enterprise' LIMIT 1),
      'manual:' || v_org_id::text,
      'active',
      NULL,
      v_used + 1,
      jsonb_build_object('source', 'venue_setup_import', 'submission_id', p_submission_id)
    );
  ELSIF v_sub_row.stripe_customer_id LIKE 'manual:%' THEN
    UPDATE public.subscriptions
    SET status = 'active', seats = GREATEST(seats, v_used + 1)
    WHERE id = v_sub_row.id;
  ELSIF v_sub_row.status NOT IN ('trialing', 'active', 'past_due') OR v_used + 1 > v_sub_row.seats THEN
    RAISE EXCEPTION 'Stripe subscription has no free seat (status=%, % used / % seats)',
      v_sub_row.status, v_used, v_sub_row.seats
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Venue (pending: going live stays a manual decision in the admin).
  INSERT INTO public.hotels (
    organization_id, name, name_en, venue_type, status,
    landing_subtitle, landing_subtitle_en, description, description_en,
    website_url, contact_email, address, postal_code, city, country, timezone,
    access_instructions, access_instructions_en,
    opening_time, closing_time,
    min_booking_notice_minutes, auto_validate_bookings, client_payment_mode,
    allow_out_of_hours_booking, out_of_hours_surcharge_percent,
    room_turnover_buffer_minutes, slot_interval,
    client_cancellation_cutoff_hours, client_reschedule_cutoff_hours,
    cancellation_tiers, cancellation_policy_text_fr, cancellation_policy_text_en,
    currency, vat, hotel_commission, therapist_commission, invoice_client,
    pms_type, pms_auto_charge_room, pms_guest_lookup_enabled,
    image, cover_image
  ) VALUES (
    v_org_id, v_hotel_name, NULLIF(v_h->>'name_en', ''),
    COALESCE(NULLIF(v_h->>'venue_type', ''), 'hotel'), 'pending',
    NULLIF(v_h->>'landing_subtitle', ''), NULLIF(v_h->>'landing_subtitle_en', ''),
    NULLIF(v_h->>'description', ''), NULLIF(v_h->>'description_en', ''),
    NULLIF(v_h->>'website_url', ''), NULLIF(v_h->>'contact_email', ''),
    NULLIF(v_h->>'address', ''), NULLIF(v_h->>'postal_code', ''), NULLIF(v_h->>'city', ''),
    COALESCE(NULLIF(lower(v_h->>'country'), ''), 'france'),
    COALESCE(NULLIF(v_h->>'timezone', ''), 'Europe/Paris'),
    NULLIF(v_h->>'access_instructions', ''), NULLIF(v_h->>'access_instructions_en', ''),
    COALESCE((v_h->>'opening_time')::time, '10:00'::time),
    COALESCE((v_h->>'closing_time')::time, '20:00'::time),
    COALESCE((v_h->>'min_booking_notice_minutes')::integer, 0),
    COALESCE((v_h->>'auto_validate_bookings')::boolean, false),
    COALESCE(NULLIF(v_h->>'client_payment_mode', ''), 'pre_authorization'),
    COALESCE((v_h->>'allow_out_of_hours_booking')::boolean, false),
    COALESCE((v_h->>'out_of_hours_surcharge_percent')::numeric, 0),
    COALESCE((v_h->>'room_turnover_buffer_minutes')::integer, 0),
    COALESCE((v_h->>'slot_interval')::integer, 30),
    COALESCE((v_h->>'client_cancellation_cutoff_hours')::numeric, 2),
    COALESCE((v_h->>'client_reschedule_cutoff_hours')::numeric, 24),
    COALESCE(v_h->'cancellation_tiers', '[]'::jsonb),
    NULLIF(v_h->>'cancellation_policy_text_fr', ''), NULLIF(v_h->>'cancellation_policy_text_en', ''),
    COALESCE(NULLIF(upper(v_h->>'currency'), ''), 'EUR'),
    COALESCE((v_h->>'vat')::numeric, 20),
    COALESCE((v_h->>'hotel_commission')::numeric, 0),
    COALESCE((v_h->>'therapist_commission')::numeric, 0),
    COALESCE(NULLIF(v_h->>'invoice_client', ''), 'organization'),
    CASE WHEN v_h->>'pms_type' IN ('opera_cloud', 'mews') THEN v_h->>'pms_type' END,
    COALESCE((v_h->>'pms_auto_charge_room')::boolean, false),
    COALESCE((v_h->>'pms_guest_lookup_enabled')::boolean, false),
    p_file_urls->>(v_h->>'image_path'),
    p_file_urls->>(v_h->>'cover_image_path')
  )
  RETURNING id INTO v_hotel_id;

  IF v_vbp IS NOT NULL AND jsonb_typeof(v_vbp) = 'object' THEN
    INSERT INTO public.billing_profiles (
      owner_type, owner_id, company_name, siret, tva_number,
      billing_address, billing_postal_code, billing_city, billing_country, contact_email
    ) VALUES (
      'hotel', v_hotel_id,
      NULLIF(v_vbp->>'company_name', ''), NULLIF(v_vbp->>'siret', ''), NULLIF(v_vbp->>'tva_number', ''),
      NULLIF(v_vbp->>'billing_address', ''), NULLIF(v_vbp->>'billing_postal_code', ''),
      NULLIF(v_vbp->>'billing_city', ''), NULLIF(v_vbp->>'billing_country', ''),
      NULLIF(v_vbp->>'contact_email', '')
    );
  END IF;

  IF v_sched IS NOT NULL AND jsonb_typeof(v_sched) = 'object' THEN
    INSERT INTO public.venue_deployment_schedules (
      hotel_id, schedule_type, days_of_week, recurring_start_date, recurring_end_date, specific_dates
    ) VALUES (
      v_hotel_id,
      COALESCE(NULLIF(v_sched->>'schedule_type', ''), 'always_open')::public.schedule_type,
      (SELECT array_agg(value::integer) FROM jsonb_array_elements_text(COALESCE(v_sched->'days_of_week', '[]'::jsonb))),
      (v_sched->>'recurring_start_date')::date,
      (v_sched->>'recurring_end_date')::date,
      (SELECT array_agg(value::date) FROM jsonb_array_elements_text(COALESCE(v_sched->'specific_dates', '[]'::jsonb)))
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_data->'venue_blocked_slots', '[]'::jsonb)) LOOP
    INSERT INTO public.venue_blocked_slots (
      hotel_id, label, start_time, end_time, days_of_week, block_date, is_active
    ) VALUES (
      v_hotel_id,
      COALESCE(NULLIF(v_item->>'label', ''), 'Fermeture'),
      (v_item->>'start_time')::time,
      (v_item->>'end_time')::time,
      (SELECT array_agg(value::integer) FROM jsonb_array_elements_text(COALESCE(v_item->'days_of_week', '[]'::jsonb))),
      (v_item->>'block_date')::date,
      true
    );
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_data->'treatment_rooms', '[]'::jsonb)) LOOP
    INSERT INTO public.treatment_rooms (
      hotel_id, hotel_name, name, room_number, room_type, capabilities, capacity, status
    ) VALUES (
      v_hotel_id, v_hotel_name,
      COALESCE(NULLIF(v_item->>'name', ''), 'Salle'),
      'ROOM-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
      COALESCE(v_item->'capabilities'->>0, 'Multi-purpose'),
      (SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(v_item->'capabilities', '[]'::jsonb))),
      COALESCE((v_item->>'capacity')::integer, 1),
      'active'
    );
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_data->'venue_amenities', '[]'::jsonb)) LOOP
    INSERT INTO public.venue_amenities (
      hotel_id, type, is_enabled, capacity_per_slot, slot_duration, is_exclusive, prep_time,
      price_external, lymfea_access_included, lymfea_access_duration, opening_time, closing_time
    ) VALUES (
      v_hotel_id,
      v_item->>'type',
      true,
      COALESCE((v_item->>'capacity_per_slot')::integer, 10),
      COALESCE((v_item->>'slot_duration')::integer, 60),
      COALESCE((v_item->>'is_exclusive')::boolean, false),
      COALESCE((v_item->>'prep_time')::integer, 0),
      COALESCE((v_item->>'price_external')::numeric, 0),
      COALESCE((v_item->>'lymfea_access_included')::boolean, true),
      COALESCE((v_item->>'lymfea_access_duration')::integer, 60),
      (v_item->>'opening_time')::time,
      (v_item->>'closing_time')::time
    );
  END LOOP;

  IF v_brand IS NOT NULL AND jsonb_typeof(v_brand) = 'object' THEN
    INSERT INTO public.venue_branding (
      hotel_id, button_color, button_text_color, welcome_background_color,
      font_title_family, font_title_url, font_body_family, font_body_url
    ) VALUES (
      v_hotel_id,
      NULLIF(v_brand->>'button_color', ''), NULLIF(v_brand->>'button_text_color', ''),
      NULLIF(v_brand->>'welcome_background_color', ''),
      NULLIF(v_brand->>'font_title_family', ''), p_file_urls->>(v_brand->>'font_title_path'),
      NULLIF(v_brand->>'font_body_family', ''), p_file_urls->>(v_brand->>'font_body_path')
    );
  END IF;

  -- 4. Venue team — rows only; invitations are sent by the caller.
  --    concierges.email is globally unique: an existing concierge of the same
  --    org is linked to the new venue (no new invite); one belonging to
  --    another org is skipped and reported.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_data->'concierges', '[]'::jsonb)) LOOP
    CONTINUE WHEN NULLIF(v_item->>'email', '') IS NULL;

    SELECT id, organization_id INTO v_concierge_id, v_existing_org
    FROM public.concierges
    WHERE email = lower(v_item->>'email');

    IF FOUND THEN
      IF v_existing_org = v_org_id THEN
        INSERT INTO public.concierge_hotels (concierge_id, hotel_id)
        VALUES (v_concierge_id, v_hotel_id);
        v_linked := v_linked || to_jsonb(lower(v_item->>'email'));
      ELSE
        v_skipped := v_skipped || to_jsonb(lower(v_item->>'email'));
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.concierges (
      organization_id, first_name, last_name, email, phone, country_code, venue_role, status
    ) VALUES (
      v_org_id,
      COALESCE(NULLIF(v_item->>'first_name', ''), ''),
      COALESCE(NULLIF(v_item->>'last_name', ''), ''),
      lower(v_item->>'email'),
      COALESCE(NULLIF(v_item->>'phone', ''), ''),
      COALESCE(NULLIF(v_item->>'country_code', ''), '+33'),
      NULLIF(v_item->>'venue_role', ''),
      'pending'
    )
    RETURNING id INTO v_concierge_id;

    INSERT INTO public.concierge_hotels (concierge_id, hotel_id)
    VALUES (v_concierge_id, v_hotel_id);

    v_concierges := v_concierges || jsonb_build_object(
      'id', v_concierge_id,
      'email', lower(v_item->>'email'),
      'first_name', v_item->>'first_name',
      'last_name', v_item->>'last_name',
      'phone', v_item->>'phone',
      'country_code', COALESCE(NULLIF(v_item->>'country_code', ''), '+33')
    );
  END LOOP;

  -- 5. Close the submission.
  UPDATE public.venue_setup_submissions
  SET status = 'imported', imported_at = now(), hotel_id = v_hotel_id
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'hotel_id', v_hotel_id,
    'concierges', v_concierges,
    'linked_concierges', v_linked,
    'skipped_concierges', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_venue_setup_submission(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_venue_setup_submission(uuid, jsonb) TO authenticated;
