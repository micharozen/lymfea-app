SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_therapist_id uuid;
  _booking_guest_count integer;
  _accepted_count integer;
  _new_status text;
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock the booking row
  SELECT therapist_id, guest_count
  INTO _current_therapist_id, _booking_guest_count
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  _booking_guest_count := COALESCE(_booking_guest_count, 1);

  -- For single-guest bookings: check if already taken (backward compat)
  IF _booking_guest_count = 1 THEN
    IF _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_taken');
    END IF;
  END IF;

  -- Check if this therapist already accepted this booking
  IF EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id AND therapist_id = _hairdresser_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  -- Check if booking already has enough therapists
  SELECT COUNT(*) INTO _accepted_count
  FROM booking_therapists
  WHERE booking_id = _booking_id AND status = 'accepted';

  IF _accepted_count >= _booking_guest_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'fully_staffed');
  END IF;

  -- Insert into bridge table
  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now());

  _accepted_count := _accepted_count + 1;

  -- Determine new status
  IF _accepted_count >= _booking_guest_count THEN
    _new_status := 'confirmed';
  ELSE
    -- Duo still needing therapists stays 'pending' (pending + guest_count > 1).
    _new_status := 'pending';
  END IF;

  -- Update booking: set first therapist as primary (backward compat), update status
  UPDATE bookings
  SET
    therapist_id = COALESCE(therapist_id, _hairdresser_id),
    therapist_name = COALESCE(therapist_name, _hairdresser_name),
    status = _new_status,
    assigned_at = CASE WHEN _new_status = 'confirmed' THEN now() ELSE assigned_at END,
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'therapist_id', therapist_id,
    'status', status,
    'guest_count', guest_count,
    'accepted_therapists', _accepted_count
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;

ALTER FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."acknowledge_audit_alert"("_alert_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE audit_log
  SET acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = _alert_id
    AND is_flagged = true
    AND acknowledged_at IS NULL;
END;
$$;

ALTER FUNCTION "public"."acknowledge_audit_alert"("_alert_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."acknowledge_audit_alerts_bulk"("_alert_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _count INT;
BEGIN
  UPDATE audit_log
  SET acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = ANY(_alert_ids)
    AND is_flagged = true
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER FUNCTION "public"."acknowledge_audit_alerts_bulk"("_alert_ids" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _start_date DATE;
  _end_date DATE;
  _current_date DATE;
  _day_of_week INT;
  _day_config JSONB;
  _day_enabled BOOLEAN;
  _affected INT := 0;
BEGIN
  _start_date := make_date(_year, _month, 1);
  _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;
  _current_date := _start_date;

  WHILE _current_date <= _end_date LOOP
    _day_of_week := EXTRACT(ISODOW FROM _current_date)::int - 1;
    _day_config := _weekly_pattern->_day_of_week;
    _day_enabled := COALESCE((_day_config->>'enabled')::boolean, false);

    INSERT INTO therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (
      _therapist_id,
      _current_date,
      _day_enabled,
      CASE
        WHEN _day_enabled THEN COALESCE(_day_config->'shifts', '[]'::jsonb)
        ELSE '[]'::jsonb
      END,
      false,
      'template_apply'
    )
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      shifts = EXCLUDED.shifts,
      is_manually_edited = false,
      last_change_source = 'template_apply',
      updated_at = now()
    WHERE _overwrite_manual
      OR NOT therapist_availability.is_manually_edited
      OR NOT _day_enabled;

    IF FOUND THEN
      _affected := _affected + 1;
    END IF;

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _affected;
END;
$$;

ALTER FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_schedule_completeness"("p_therapist_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _horizon_days constant int := 14;
  _tz constant text := 'Europe/Paris';
  _start_date date := (timezone(_tz, now()))::date;
  _end_date date := _start_date + (_horizon_days - 1);
  _weekly_pattern jsonb;
  _has_template boolean := false;
  _declared_days int := 0;
  _expected_days int := 0;
  _status text;
  _is_incomplete boolean;
  _d date;
  _day_index int;
  _day_config jsonb;
  _i int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM therapists t
      WHERE t.id = p_therapist_id AND t.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  SELECT weekly_pattern INTO _weekly_pattern
  FROM therapist_schedule_templates
  WHERE therapist_id = p_therapist_id;

  IF _weekly_pattern IS NOT NULL AND jsonb_typeof(_weekly_pattern) = 'array' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_weekly_pattern) AS elem
      WHERE COALESCE((elem->>'enabled')::boolean, false)
        AND jsonb_array_length(COALESCE(elem->'shifts', '[]'::jsonb)) > 0
    ) INTO _has_template;
  END IF;

  SELECT COUNT(*)::int INTO _declared_days
  FROM therapist_availability ta
  WHERE ta.therapist_id = p_therapist_id
    AND ta.date BETWEEN _start_date AND _end_date
    AND ta.is_available = true
    AND jsonb_array_length(COALESCE(ta.shifts, '[]'::jsonb)) > 0;

  IF _weekly_pattern IS NOT NULL AND jsonb_typeof(_weekly_pattern) = 'array' THEN
    _d := _start_date;
    FOR _i IN 1.._horizon_days LOOP
      _day_index := EXTRACT(ISODOW FROM _d)::int - 1;
      _day_config := _weekly_pattern->_day_index;
      IF COALESCE((_day_config->>'enabled')::boolean, false)
         AND jsonb_array_length(COALESCE(_day_config->'shifts', '[]'::jsonb)) > 0 THEN
        _expected_days := _expected_days + 1;
      END IF;
      _d := _d + 1;
    END LOOP;
  END IF;

  IF NOT _has_template THEN
    _status := 'no_template';
  ELSIF _declared_days = 0 THEN
    _status := 'template_not_applied';
  ELSIF _expected_days > 0 AND _declared_days < _expected_days THEN
    _status := 'partial';
  ELSE
    _status := 'complete';
  END IF;

  _is_incomplete := _status IN ('no_template', 'template_not_applied');

  RETURN jsonb_build_object(
    'status', _status,
    'is_incomplete', _is_incomplete,
    'declared_days_count', _declared_days,
    'expected_days_count', _expected_days,
    'horizon_days', _horizon_days,
    'has_template', _has_template,
    'weekly_pattern', _weekly_pattern
  );
END;
$$;

ALTER FUNCTION "public"."get_schedule_completeness"("p_therapist_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_incomplete_schedule_therapist_ids"("p_dedup_days" integer DEFAULT 14, "p_reminder_type" "text" DEFAULT 'biweekly'::"text") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH active_therapists AS (
    SELECT DISTINCT t.id
    FROM therapists t
    INNER JOIN therapist_venues tv ON tv.therapist_id = t.id
    WHERE t.user_id IS NOT NULL
      AND COALESCE(t.status, '') IN ('Active', 'Actif', 'active')
  ),
  recently_reminded AS (
    SELECT DISTINCT srl.therapist_id
    FROM schedule_reminder_logs srl
    WHERE srl.reminder_type = p_reminder_type
      AND srl.sent_at >= now() - (p_dedup_days || ' days')::interval
  )
  SELECT a.id
  FROM active_therapists a
  LEFT JOIN recently_reminded r ON r.therapist_id = a.id
  WHERE r.therapist_id IS NULL
    AND (public.get_schedule_completeness(a.id)->>'is_incomplete')::boolean = true;
$$;

ALTER FUNCTION "public"."get_incomplete_schedule_therapist_ids"("p_dedup_days" integer, "p_reminder_type" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."claim_gift_card"("_code" "text", "_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid UUID;
  _customer_id UUID;
  _ctb customer_treatment_bundles%ROWTYPE;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code AND is_gift = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;
  IF _ctb.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift code already claimed';
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  -- Find or create the customers row for this auth user
  SELECT id INTO _customer_id FROM customers WHERE auth_user_id = _uid LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (auth_user_id, email, profile_completed)
    VALUES (_uid, _email, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN _ctb.id;
END;
$$;

ALTER FUNCTION "public"."claim_gift_card"("_code" "text", "_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."claim_gift_card_public"("_code" "text", "_email" "text", "_first_name" "text" DEFAULT NULL::"text") RETURNS TABLE("bundle_id" "uuid", "hotel_id" "text", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _ctb customer_treatment_bundles%ROWTYPE;
  _customer_id UUID;
BEGIN
  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  IF _email IS NULL OR length(trim(_email)) < 5 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;
  IF _ctb.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift code already claimed';
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  -- Find existing customer by email, or create one
  SELECT id INTO _customer_id
  FROM customers
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (email, first_name, profile_completed)
    VALUES (lower(trim(_email)), _first_name, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN QUERY
  SELECT _ctb.id, _ctb.hotel_id, 'claimed'::TEXT;
END;
$$;

ALTER FUNCTION "public"."claim_gift_card_public"("_code" "text", "_email" "text", "_first_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cleanup_old_rate_limits"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.otp_rate_limits 
  WHERE first_attempt_at < now() - interval '1 hour';
END;
$$;

ALTER FUNCTION "public"."cleanup_old_rate_limits"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_audit_log"("_table_name" "text", "_record_id" "text", "_change_type" "text", "_old_values" "jsonb" DEFAULT NULL::"jsonb", "_new_values" "jsonb" DEFAULT NULL::"jsonb", "_source" "text" DEFAULT 'unknown'::"text", "_metadata" "jsonb" DEFAULT '{}'::"jsonb", "_is_flagged" boolean DEFAULT false, "_flag_type" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _id UUID;
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata,
    is_flagged, flag_type
  ) VALUES (
    _table_name, _record_id, auth.uid(), _change_type,
    _old_values, _new_values, _source, _metadata,
    _is_flagged, _flag_type
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

ALTER FUNCTION "public"."create_audit_log"("_table_name" "text", "_record_id" "text", "_change_type" "text", "_old_values" "jsonb", "_new_values" "jsonb", "_source" "text", "_metadata" "jsonb", "_is_flagged" boolean, "_flag_type" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _template treatment_bundles%ROWTYPE;
  _new_id UUID;
BEGIN
  SELECT * INTO _template
  FROM treatment_bundles
  WHERE id = _bundle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle template not found: %', _bundle_id;
  END IF;

  IF _template.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle template is not active';
  END IF;

  IF _template.bundle_type <> 'cure' THEN
    RAISE EXCEPTION 'Use create_customer_gift_card for non-cure bundle types';
  END IF;

  INSERT INTO customer_treatment_bundles (
    bundle_id, customer_id, beneficiary_customer_id, hotel_id,
    total_sessions, expires_at, booking_id
  )
  VALUES (
    _bundle_id, _customer_id, _customer_id, _hotel_id,
    _template.total_sessions,
    CURRENT_DATE + _template.validity_days,
    _booking_id
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

ALTER FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid") IS 'Creates a customer bundle entry with expiry calculated from the template validity_days';

CREATE OR REPLACE FUNCTION "public"."create_customer_gift_card"("_bundle_id" "uuid", "_purchaser_customer_id" "uuid", "_hotel_id" "text", "_is_gift" boolean, "_gift_delivery_mode" "text" DEFAULT NULL::"text", "_sender_name" "text" DEFAULT NULL::"text", "_sender_email" "text" DEFAULT NULL::"text", "_recipient_name" "text" DEFAULT NULL::"text", "_recipient_email" "text" DEFAULT NULL::"text", "_gift_message" "text" DEFAULT NULL::"text", "_payment_reference" "text" DEFAULT NULL::"text") RETURNS TABLE("customer_bundle_id" "uuid", "redemption_code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _template treatment_bundles%ROWTYPE;
  _beneficiary UUID;
  _code TEXT;
  _new_id UUID;
BEGIN
  SELECT * INTO _template FROM treatment_bundles WHERE id = _bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle template not found: %', _bundle_id;
  END IF;
  IF _template.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle template is not active';
  END IF;
  IF _template.bundle_type NOT IN ('gift_treatments', 'gift_amount') THEN
    RAISE EXCEPTION 'Not a gift card template';
  END IF;

  -- Always generate a code so every gift card holder can access the portal
  _code := generate_gift_redemption_code();

  IF _is_gift THEN
    IF _gift_delivery_mode IS NULL OR _gift_delivery_mode NOT IN ('email', 'print') THEN
      RAISE EXCEPTION 'Invalid gift_delivery_mode';
    END IF;
    IF _gift_delivery_mode = 'email' AND (_recipient_email IS NULL OR length(trim(_recipient_email)) = 0) THEN
      RAISE EXCEPTION 'recipient_email is required for email delivery';
    END IF;
    _beneficiary := NULL;
  ELSE
    _beneficiary := _purchaser_customer_id;
  END IF;

  INSERT INTO customer_treatment_bundles (
    bundle_id,
    customer_id,
    beneficiary_customer_id,
    hotel_id,
    total_sessions,
    total_amount_cents,
    expires_at,
    is_gift,
    gift_delivery_mode,
    sender_name,
    sender_email,
    recipient_name,
    recipient_email,
    gift_message,
    redemption_code,
    payment_reference
  )
  VALUES (
    _bundle_id,
    _purchaser_customer_id,
    _beneficiary,
    _hotel_id,
    _template.total_sessions,
    _template.amount_cents,
    CURRENT_DATE + _template.validity_days,
    _is_gift,
    CASE WHEN _is_gift THEN _gift_delivery_mode ELSE NULL END,
    _sender_name,
    _sender_email,
    CASE WHEN _is_gift THEN _recipient_name ELSE NULL END,
    CASE WHEN _is_gift AND _gift_delivery_mode = 'email' THEN _recipient_email ELSE NULL END,
    _gift_message,
    _code,
    _payment_reference
  )
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _new_id, _code;
END;
$$;

ALTER FUNCTION "public"."create_customer_gift_card"("_bundle_id" "uuid", "_purchaser_customer_id" "uuid", "_hotel_id" "text", "_is_gift" boolean, "_gift_delivery_mode" "text", "_sender_name" "text", "_sender_email" "text", "_recipient_name" "text", "_recipient_email" "text", "_gift_message" "text", "_payment_reference" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_therapist_absence"("_therapist_id" "uuid", "_start_date" "date", "_end_date" "date", "_reason" "text", "_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _absence_id UUID;
  _current_date DATE;
BEGIN
  -- Validate reason
  IF _reason NOT IN ('vacation', 'sick', 'other') THEN
    RAISE EXCEPTION 'Invalid reason: %', _reason;
  END IF;

  -- Validate date range
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;

  -- Insert the absence record
  INSERT INTO public.therapist_absences (therapist_id, start_date, end_date, reason, note)
  VALUES (_therapist_id, _start_date, _end_date, _reason, _note)
  RETURNING id INTO _absence_id;

  -- Sync to therapist_availability: mark each day as unavailable
  _current_date := _start_date;
  WHILE _current_date <= _end_date LOOP
    INSERT INTO public.therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (_therapist_id, _current_date, false, '[]'::jsonb, true, 'absence')
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = false,
      shifts = '[]'::jsonb,
      is_manually_edited = true,
      last_change_source = 'absence',
      updated_at = now();

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _absence_id;
END;
$$;

ALTER FUNCTION "public"."create_therapist_absence"("_therapist_id" "uuid", "_start_date" "date", "_end_date" "date", "_reason" "text", "_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text" DEFAULT NULL::"text", "_client_email" "text" DEFAULT NULL::"text", "_room_number" "text" DEFAULT NULL::"text", "_description" "text" DEFAULT NULL::"text", "_treatment_id" "uuid" DEFAULT NULL::"uuid", "_preferred_date" "date" DEFAULT NULL::"date", "_preferred_time" time without time zone DEFAULT NULL::time without time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _new_id uuid;
BEGIN
  -- Validate inputs
  PERFORM public.validate_treatment_request(
    _client_first_name,
    _client_phone,
    _hotel_id,
    _client_email,
    _description
  );
  
  -- Insert the request
  INSERT INTO public.treatment_requests (
    client_first_name,
    client_last_name,
    client_phone,
    client_email,
    hotel_id,
    room_number,
    description,
    treatment_id,
    preferred_date,
    preferred_time
  ) VALUES (
    trim(_client_first_name),
    trim(_client_last_name),
    trim(_client_phone),
    trim(_client_email),
    _hotel_id,
    trim(_room_number),
    trim(_description),
    _treatment_id,
    _preferred_date,
    _preferred_time
  )
  RETURNING id INTO _new_id;
  
  RETURN _new_id;
END;
$$;

ALTER FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."decline_booking"("_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _therapist_id UUID;
  _booking_hotel_id TEXT;
  _is_affiliated BOOLEAN;
BEGIN
  -- 1. Resolve connected therapist identity
  SELECT id INTO _therapist_id
  FROM public.therapists
  WHERE user_id = auth.uid();

  IF _therapist_id IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : profil thérapeute introuvable pour cet utilisateur';
  END IF;

  -- 2. Check booking exists, is pending, and either unassigned OR assigned to this therapist
  SELECT hotel_id INTO _booking_hotel_id
  FROM public.bookings
  WHERE id = _booking_id
    AND status = 'pending'
    AND (therapist_id IS NULL OR therapist_id = _therapist_id);

  IF _booking_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà assignée ou non en attente';
  END IF;

  -- 3. Check therapist is affiliated to the booking's hotel
  SELECT EXISTS(
    SELECT 1 FROM public.therapist_venues
    WHERE therapist_id = _therapist_id
      AND hotel_id = _booking_hotel_id
  ) INTO _is_affiliated;

  IF NOT _is_affiliated THEN
    RAISE EXCEPTION 'Accès refusé : ce thérapeute n''est pas affilié à l''hôtel de cette réservation';
  END IF;

  -- 4. Add to declined_by (idempotent) and clear therapist_id so the
  --    booking returns to the unassigned pool for gender-fallback dispatch
  UPDATE public.bookings
  SET
    declined_by  = array_append(COALESCE(declined_by, ARRAY[]::uuid[]), _therapist_id),
    therapist_id = NULL
  WHERE id = _booking_id
    AND NOT (COALESCE(declined_by, ARRAY[]::uuid[]) @> ARRAY[_therapist_id]);

END;
$$;

ALTER FUNCTION "public"."decline_booking"("_booking_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_therapist_absence"("_absence_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _absence RECORD;
  _current_date DATE;
  _other_absence_exists BOOLEAN;
BEGIN
  -- Get the absence to delete
  SELECT * INTO _absence FROM public.therapist_absences WHERE id = _absence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Absence not found';
  END IF;

  -- Delete the absence record
  DELETE FROM public.therapist_absences WHERE id = _absence_id;

  -- For each day in the range, check if another absence still covers it
  _current_date := _absence.start_date;
  WHILE _current_date <= _absence.end_date LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.therapist_absences
      WHERE therapist_id = _absence.therapist_id
        AND _current_date BETWEEN start_date AND end_date
    ) INTO _other_absence_exists;

    IF NOT _other_absence_exists THEN
      -- No other absence covers this day: remove the availability override
      -- Only delete if it was created by the absence system
      DELETE FROM public.therapist_availability
      WHERE therapist_id = _absence.therapist_id
        AND date = _current_date
        AND last_change_source = 'absence';
    END IF;

    _current_date := _current_date + 1;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."delete_therapist_absence"("_absence_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."detect_bundles_for_auth_customer"("_hotel_id" "text", "_treatment_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _auth_user_id UUID;
  _customer_id UUID;
  _session_bundles JSON;
  _amount_bundles JSON;
BEGIN
  _auth_user_id := auth.uid();
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _customer_id
  FROM customers
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN json_build_object('session_bundles', '[]'::JSON, 'amount_bundles', '[]'::JSON);
  END IF;

  -- Session bundles (cure + gift_treatments)
  SELECT COALESCE(json_agg(row_to_json(sb)), '[]'::JSON)
  INTO _session_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      ctb.total_sessions,
      ctb.used_sessions,
      (ctb.total_sessions - ctb.used_sessions) AS remaining_sessions,
      ctb.expires_at,
      array_agg(DISTINCT tbi.treatment_id) AS eligible_treatment_ids
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    JOIN treatment_bundle_items tbi ON tbi.bundle_id = tb.id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type IN ('cure', 'gift_treatments')
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_sessions IS NOT NULL
      AND ctb.used_sessions < ctb.total_sessions
      AND (
        _treatment_ids IS NULL
        OR tbi.treatment_id = ANY(_treatment_ids)
      )
    GROUP BY ctb.id, tb.name, tb.name_en, tb.bundle_type, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
    HAVING (
      _treatment_ids IS NULL
      OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
    )
  ) sb;

  -- Amount bundles (gift_amount)
  SELECT COALESCE(json_agg(row_to_json(ab)), '[]'::JSON)
  INTO _amount_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.cover_image_url,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      (ctb.total_amount_cents - ctb.used_amount_cents) AS remaining_amount_cents,
      ctb.expires_at
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type = 'gift_amount'
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_amount_cents IS NOT NULL
      AND ctb.used_amount_cents < ctb.total_amount_cents
  ) ab;

  RETURN json_build_object(
    'session_bundles', _session_bundles,
    'amount_bundles', _amount_bundles
  );
END;
$$;

ALTER FUNCTION "public"."detect_bundles_for_auth_customer"("_hotel_id" "text", "_treatment_ids" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."detect_bundles_for_booking"("_phone" "text", "_hotel_id" "text", "_treatment_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("customer_bundle_id" "uuid", "bundle_name" "text", "bundle_name_en" "text", "total_sessions" integer, "used_sessions" integer, "remaining_sessions" integer, "expires_at" "date", "eligible_treatment_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _normalized_phone TEXT;
  _customer_id UUID;
BEGIN
  _normalized_phone := regexp_replace(trim(_phone), '[\s\-\.]', '', 'g');

  SELECT c.id INTO _customer_id
  FROM customers c
  WHERE c.phone IS NOT NULL
    AND regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g') = _normalized_phone
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id AS customer_bundle_id,
    tb.name AS bundle_name,
    tb.name_en AS bundle_name_en,
    ctb.total_sessions,
    ctb.used_sessions,
    (ctb.total_sessions - ctb.used_sessions) AS remaining_sessions,
    ctb.expires_at,
    array_agg(DISTINCT tbi.treatment_id) AS eligible_treatment_ids
  FROM customer_treatment_bundles ctb
  JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
  JOIN treatment_bundle_items tbi ON tbi.bundle_id = tb.id
  WHERE ctb.beneficiary_customer_id = _customer_id
    AND ctb.hotel_id = _hotel_id
    AND ctb.status = 'active'
    AND tb.bundle_type IN ('cure', 'gift_treatments')
    AND ctb.expires_at >= CURRENT_DATE
    AND ctb.total_sessions IS NOT NULL
    AND ctb.used_sessions < ctb.total_sessions
    AND (
      _treatment_ids IS NULL
      OR tbi.treatment_id = ANY(_treatment_ids)
    )
  GROUP BY ctb.id, tb.name, tb.name_en, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
  HAVING (
    _treatment_ids IS NULL
    OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
  );
END;
$$;

ALTER FUNCTION "public"."detect_bundles_for_booking"("_phone" "text", "_hotel_id" "text", "_treatment_ids" "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."detect_bundles_for_booking"("_phone" "text", "_hotel_id" "text", "_treatment_ids" "uuid"[]) IS 'Finds active bundles for a customer by phone number, optionally filtered by treatment IDs';

CREATE OR REPLACE FUNCTION "public"."detect_gift_cards_for_booking"("_phone" "text", "_hotel_id" "text") RETURNS TABLE("customer_bundle_id" "uuid", "title" "text", "title_en" "text", "cover_image_url" "text", "total_amount_cents" integer, "used_amount_cents" integer, "remaining_amount_cents" integer, "expires_at" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _normalized_phone TEXT;
  _customer_id UUID;
BEGIN
  _normalized_phone := regexp_replace(trim(_phone), '[\s\-\.]', '', 'g');

  SELECT c.id INTO _customer_id
  FROM customers c
  WHERE c.phone IS NOT NULL
    AND regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g') = _normalized_phone
  LIMIT 1;

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id,
    tb.title,
    tb.title_en,
    tb.cover_image_url,
    ctb.total_amount_cents,
    ctb.used_amount_cents,
    (ctb.total_amount_cents - ctb.used_amount_cents) AS remaining_amount_cents,
    ctb.expires_at
  FROM customer_treatment_bundles ctb
  JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
  WHERE ctb.beneficiary_customer_id = _customer_id
    AND ctb.hotel_id = _hotel_id
    AND ctb.status = 'active'
    AND tb.bundle_type = 'gift_amount'
    AND ctb.expires_at >= CURRENT_DATE
    AND ctb.total_amount_cents IS NOT NULL
    AND ctb.used_amount_cents < ctb.total_amount_cents;
END;
$$;

ALTER FUNCTION "public"."detect_gift_cards_for_booking"("_phone" "text", "_hotel_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."expire_overdue_bundles"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _count INTEGER;
BEGIN
  UPDATE customer_treatment_bundles
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at < CURRENT_DATE;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER FUNCTION "public"."expire_overdue_bundles"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."expire_overdue_bundles"() IS 'Expires active bundles past their expiration date. Intended for daily cron execution.';

CREATE OR REPLACE FUNCTION "public"."find_or_create_customer"("_phone" "text", "_first_name" "text", "_last_name" "text" DEFAULT NULL::"text", "_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _customer_id UUID;
  _normalized_phone TEXT;
  _normalized_email TEXT;
BEGIN
  _normalized_phone := REPLACE(_phone, ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');

  SELECT id INTO _customer_id
  FROM customers
  WHERE REPLACE(phone, ' ', '') = _normalized_phone;

  IF _customer_id IS NOT NULL THEN
    IF _normalized_email IS NOT NULL THEN
      UPDATE customers
      SET email = _normalized_email
      WHERE id = _customer_id
        AND (email IS DISTINCT FROM _normalized_email);
    END IF;
    RETURN _customer_id;
  END IF;

  INSERT INTO customers (phone, first_name, last_name, email)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE phone = _normalized_phone;

    IF _customer_id IS NOT NULL AND _normalized_email IS NOT NULL THEN
      UPDATE customers
      SET email = _normalized_email
      WHERE id = _customer_id
        AND (email IS DISTINCT FROM _normalized_email);
    END IF;
  END IF;

  RETURN _customer_id;
END;
$$;

ALTER FUNCTION "public"."find_or_create_customer"("_phone" "text", "_first_name" "text", "_last_name" "text", "_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_gift_redemption_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no ambiguous 0/O/1/I
  _code TEXT;
  _i INTEGER;
  _exists BOOLEAN;
  _attempts INTEGER := 0;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..10 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;

    SELECT EXISTS (
      SELECT 1 FROM customer_treatment_bundles WHERE redemption_code = _code
    ) INTO _exists;

    EXIT WHEN NOT _exists;
    _attempts := _attempts + 1;
    IF _attempts >= 10 THEN
      RAISE EXCEPTION 'Failed to generate unique redemption code after 10 attempts';
    END IF;
  END LOOP;

  RETURN _code;
END;
$$;

ALTER FUNCTION "public"."generate_gift_redemption_code"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_unique_hotel_slug"("_base" "text", "_exclude_id" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug text;
  candidate text;
  n integer := 1;
BEGIN
  base_slug := public.slugify(_base);
  IF base_slug IS NULL OR LENGTH(base_slug) < 2 THEN
    base_slug := 'venue';
  END IF;
  candidate := base_slug;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.hotels
      WHERE slug = candidate
        AND (_exclude_id IS NULL OR id <> _exclude_id)
    ) THEN
      RETURN candidate;
    END IF;
    n := n + 1;
    candidate := LEFT(base_slug, 58) || '-' || n::text;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."generate_unique_hotel_slug"("_base" "text", "_exclude_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_unique_treatment_slug"("_hotel_id" "text", "_base" "text", "_exclude_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug text;
  candidate text;
  n integer := 1;
BEGIN
  base_slug := public.slugify(_base);
  IF base_slug IS NULL OR LENGTH(base_slug) < 2 THEN
    base_slug := 'treatment';
  END IF;

  candidate := base_slug;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.treatment_menus
      WHERE hotel_id = _hotel_id
        AND slug = candidate
        AND (_exclude_id IS NULL OR id <> _exclude_id)
    ) THEN
      RETURN candidate;
    END IF;
    n := n + 1;
    candidate := LEFT(base_slug, 58) || '-' || n::text;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."generate_unique_treatment_slug"("_hotel_id" "text", "_base" "text", "_exclude_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(SUM(num_guests), 0)::INTEGER
  FROM amenity_bookings
  WHERE venue_amenity_id = p_venue_amenity_id
    AND booking_date = p_date
    AND status NOT IN ('cancelled')
    AND booking_time < p_end_time
    AND end_time > p_start_time;
$$;

ALTER FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) IS 'Returns total guests booked for a given amenity slot (for capacity checking)';

CREATE OR REPLACE FUNCTION "public"."get_booking_by_signature_token"("p_token" "text") RETURNS TABLE("client_first_name" "text", "client_last_name" "text", "hotel_name" "text", "treatment_name" "text", "total_price" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.client_first_name, 
        b.client_last_name, 
        b.hotel_name,
        -- Récupération dynamique des soins liés à la réservation
        COALESCE(
            (
                SELECT string_agg(tm.name, ', ')
                FROM booking_treatments bt
                JOIN treatment_menus tm ON bt.treatment_id = tm.id
                WHERE bt.booking_id = b.id
            ), 
            'Soin sur mesure'
        ) AS treatment_name,
        b.total_price
    FROM bookings b
    WHERE b.signature_token = p_token
    AND b.signed_at IS NULL;
END;
$$;

ALTER FUNCTION "public"."get_booking_by_signature_token"("p_token" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_booking_summary"("_booking_id" "uuid") RETURNS json
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    'hotels', (SELECT json_build_object('name', name) FROM hotels WHERE id = b.hotel_id),
    'treatments', COALESCE(
      (
        SELECT json_agg(tm.name)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      '[]'::json
    )
  )
  FROM bookings b
  WHERE b.id = _booking_id;
$$;

ALTER FUNCTION "public"."get_booking_summary"("_booking_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_client_funnel"("_hotel_id" "text" DEFAULT NULL::"text", "_start_date" "date" DEFAULT (CURRENT_DATE - '30 days'::interval), "_end_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("step_name" "text", "step_order" integer, "unique_sessions" bigint, "total_events" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH funnel_steps AS (
    SELECT
      ca.event_name,
      ca.session_id,
      CASE ca.event_name
        WHEN 'welcome' THEN 1
        WHEN 'treatments' THEN 2
        WHEN 'schedule' THEN 3
        WHEN 'guest_info' THEN 4
        WHEN 'payment' THEN 5
        WHEN 'booking_completed' THEN 6
        ELSE 99
      END as step_ord
    FROM public.client_analytics ca
    WHERE ca.event_type IN ('page_view', 'conversion')
      AND ca.created_at >= _start_date
      AND ca.created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR ca.hotel_id = _hotel_id)
      AND ca.event_name IN ('welcome', 'treatments', 'schedule', 'guest_info', 'payment', 'booking_completed')
  )
  SELECT
    fs.event_name::TEXT as step_name,
    MIN(fs.step_ord)::INTEGER as step_order,
    COUNT(DISTINCT fs.session_id)::BIGINT as unique_sessions,
    COUNT(*)::BIGINT as total_events
  FROM funnel_steps fs
  GROUP BY fs.event_name
  ORDER BY MIN(fs.step_ord);
END;
$$;

ALTER FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") RETURNS TABLE("hotel_id" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ch.hotel_id
  FROM public.concierge_hotels ch
  JOIN public.concierges c ON c.id = ch.concierge_id
  WHERE c.user_id = _user_id;
$$;

ALTER FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_customer_portal_data"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _auth_user_id UUID;
  _customer customers%ROWTYPE;
  _gift_cards JSON;
  _upcoming_bookings JSON;
  _past_bookings JSON;
  _result JSON;
BEGIN
  _auth_user_id := auth.uid();

  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find customer by auth_user_id
  SELECT * INTO _customer
  FROM customers
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  -- Gift cards / bundles where this customer is the beneficiary
  SELECT COALESCE(json_agg(gc ORDER BY gc.created_at DESC), '[]'::JSON)
  INTO _gift_cards
  FROM (
    SELECT
      ctb.id,
      ctb.bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      tb.cover_image_url,
      ctb.total_sessions,
      ctb.used_sessions,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      ctb.status,
      ctb.expires_at,
      ctb.is_gift,
      ctb.sender_name,
      ctb.gift_message,
      ctb.claimed_at,
      ctb.created_at,
      ctb.hotel_id,
      h.name AS hotel_name
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    LEFT JOIN hotels h ON h.id = ctb.hotel_id
    WHERE ctb.beneficiary_customer_id = _customer.id
  ) gc;

  -- Upcoming bookings (today or future)
  SELECT COALESCE(json_agg(ub ORDER BY ub.booking_date ASC, ub.booking_time ASC), '[]'::JSON)
  INTO _upcoming_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      h.name AS hotel_name,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = _customer.id
      AND b.booking_date >= CURRENT_DATE
      AND b.status NOT IN ('cancelled', 'no_show')
    LIMIT 20
  ) ub;

  -- Past bookings
  SELECT COALESCE(json_agg(pb ORDER BY pb.booking_date DESC), '[]'::JSON)
  INTO _past_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      h.name AS hotel_name,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = _customer.id
      AND b.booking_date < CURRENT_DATE
    ORDER BY b.booking_date DESC
    LIMIT 50
  ) pb;

  -- Build result
  _result := json_build_object(
    'customer', json_build_object(
      'id', _customer.id,
      'first_name', _customer.first_name,
      'last_name', _customer.last_name,
      'email', _customer.email,
      'phone', _customer.phone
    ),
    'gift_cards', _gift_cards,
    'upcoming_bookings', _upcoming_bookings,
    'past_bookings', _past_bookings
  );

  RETURN _result;
END;
$$;

ALTER FUNCTION "public"."get_customer_portal_data"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_enterprise_session_data"("_hotel_id" "text", "_session_date" "date" DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _hotel RECORD;
  _day_of_week INTEGER;
  _total_slots INTEGER;
  _blocked_slot_units INTEGER;
  _slot_seconds INTEGER;
  _result JSON;
BEGIN
  -- 1. Get hotel info
  SELECT id, name, image, cover_image, venue_type,
         opening_time, closing_time, timezone, currency,
         COALESCE(slot_interval, 30) AS slot_interval
  INTO _hotel
  FROM hotels
  WHERE id = _hotel_id;

  IF _hotel IS NULL THEN
    RETURN json_build_object('error', 'hotel_not_found');
  END IF;

  -- 2. Day of week (0=Sunday, 6=Saturday) — matches JS getDay() and PostgreSQL DOW
  _day_of_week := EXTRACT(DOW FROM _session_date)::INTEGER;

  -- 3. Calculate total slot windows between opening and closing using configured interval
  _slot_seconds := _hotel.slot_interval * 60;
  _total_slots := EXTRACT(EPOCH FROM (
    COALESCE(_hotel.closing_time, '23:00:00')::TIME -
    COALESCE(_hotel.opening_time, '06:00:00')::TIME
  ))::INTEGER / _slot_seconds;

  -- 4. Subtract blocked slot units (e.g., lunch breaks)
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / _slot_seconds
  ), 0)
  INTO _blocked_slot_units
  FROM venue_blocked_slots
  WHERE hotel_id = _hotel_id
    AND is_active = true
    AND (days_of_week IS NULL OR _day_of_week = ANY(days_of_week));

  _total_slots := GREATEST(_total_slots - _blocked_slot_units, 0);

  -- 5. Build result JSON
  SELECT json_build_object(
    'hotel', json_build_object(
      'id', _hotel.id,
      'name', _hotel.name,
      'image', _hotel.image,
      'cover_image', _hotel.cover_image,
      'venue_type', _hotel.venue_type,
      'opening_time', _hotel.opening_time,
      'closing_time', _hotel.closing_time,
      'timezone', _hotel.timezone,
      'currency', _hotel.currency,
      'slot_interval', _hotel.slot_interval
    ),
    'is_deployed', is_venue_available_on_date(_hotel_id, _session_date),
    'session', json_build_object(
      'date', _session_date,
      'total_slots', _total_slots,
      'booked_count', (
        SELECT COUNT(*)
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'booked_units', (
        SELECT COALESCE(SUM(CEIL(COALESCE(duration, _hotel.slot_interval)::NUMERIC / _hotel.slot_interval)), 0)
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'unique_clients', (
        SELECT COUNT(DISTINCT LOWER(TRIM(
          COALESCE(client_email, client_first_name || ' ' || client_last_name)
        )))
        FROM bookings
        WHERE hotel_id = _hotel_id
          AND booking_date = _session_date
          AND status NOT IN ('Annulé', 'cancelled')
      ),
      'bookings', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'id', b.id,
            'booking_time', b.booking_time,
            'duration', COALESCE(b.duration, _hotel.slot_interval),
            'client_first_name', b.client_first_name,
            'client_last_name', LEFT(b.client_last_name, 1) || '.',
            'status', b.status,
            'treatments', (
              SELECT COALESCE(json_agg(json_build_object(
                'name', tm.name,
                'duration', tm.duration
              )), '[]'::JSON)
              FROM booking_treatments bt
              JOIN treatment_menus tm ON tm.id = bt.treatment_id
              WHERE bt.booking_id = b.id
            )
          ) ORDER BY b.booking_time
        ), '[]'::JSON)
        FROM bookings b
        WHERE b.hotel_id = _hotel_id
          AND b.booking_date = _session_date
          AND b.status NOT IN ('Annulé', 'cancelled')
      ),
      'blocked_slots', (
        SELECT COALESCE(json_agg(json_build_object(
          'label', vbs.label,
          'start_time', vbs.start_time,
          'end_time', vbs.end_time
        )), '[]'::JSON)
        FROM venue_blocked_slots vbs
        WHERE vbs.hotel_id = _hotel_id
          AND vbs.is_active = true
          AND (vbs.days_of_week IS NULL OR _day_of_week = ANY(vbs.days_of_week))
      ),
      'popular_treatments', (
        SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::JSON)
        FROM (
          SELECT tm.name, COUNT(*)::INTEGER as count
          FROM bookings b
          JOIN booking_treatments bt ON bt.booking_id = b.id
          JOIN treatment_menus tm ON tm.id = bt.treatment_id
          WHERE b.hotel_id = _hotel_id
            AND b.booking_date = _session_date
            AND b.status NOT IN ('Annulé', 'cancelled')
          GROUP BY tm.name
          ORDER BY count DESC
          LIMIT 5
        ) t
      )
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

ALTER FUNCTION "public"."get_enterprise_session_data"("_hotel_id" "text", "_session_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text" DEFAULT NULL::"text", "_start_date" "date" DEFAULT (CURRENT_DATE - '30 days'::interval), "_end_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("total_sessions" bigint, "total_page_views" bigint, "total_conversions" bigint, "conversion_rate" numeric, "device_breakdown" "jsonb", "daily_visitors" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _device_breakdown JSONB;
  _daily_visitors JSONB;
BEGIN
  -- Device breakdown
  SELECT COALESCE(jsonb_object_agg(dt, cnt), '{}'::JSONB)
  INTO _device_breakdown
  FROM (
    SELECT
      COALESCE(device_type, 'unknown') as dt,
      COUNT(DISTINCT session_id)::BIGINT as cnt
    FROM public.client_analytics
    WHERE created_at >= _start_date
      AND created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR hotel_id = _hotel_id)
    GROUP BY device_type
  ) sub;

  -- Daily visitors
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::TEXT, 'visitors', visitors) ORDER BY day), '[]'::JSONB)
  INTO _daily_visitors
  FROM (
    SELECT
      DATE(created_at) as day,
      COUNT(DISTINCT session_id)::BIGINT as visitors
    FROM public.client_analytics
    WHERE created_at >= _start_date
      AND created_at < _end_date + INTERVAL '1 day'
      AND (_hotel_id IS NULL OR hotel_id = _hotel_id)
    GROUP BY DATE(created_at)
  ) sub;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT session_id)::BIGINT as total_sessions,
    COUNT(*) FILTER (WHERE event_type = 'page_view')::BIGINT as total_page_views,
    COUNT(*) FILTER (WHERE event_type = 'conversion')::BIGINT as total_conversions,
    CASE
      WHEN COUNT(DISTINCT session_id) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'conversion')::NUMERIC / COUNT(DISTINCT session_id)::NUMERIC) * 100, 2)
      ELSE 0
    END as conversion_rate,
    _device_breakdown as device_breakdown,
    _daily_visitors as daily_visitors
  FROM public.client_analytics
  WHERE created_at >= _start_date
    AND created_at < _end_date + INTERVAL '1 day'
    AND (_hotel_id IS NULL OR hotel_id = _hotel_id);
END;
$$;

ALTER FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_hotel"("_identifier" "text") RETURNS TABLE("id" "text", "slug" "text", "name" "text", "name_en" "text", "image" "text", "cover_image" "text", "city" "text", "country" "text", "currency" "text", "status" "text", "vat" numeric, "opening_time" time without time zone, "closing_time" time without time zone, "schedule_type" "text", "days_of_week" integer[], "recurrence_interval" integer, "recurring_start_date" "date", "recurring_end_date" "date", "venue_type" "text", "description" "text", "description_en" "text", "landing_subtitle" "text", "landing_subtitle_en" "text", "offert" boolean, "slot_interval" integer, "company_offered" boolean, "pms_guest_lookup_enabled" boolean, "address" "text", "postal_code" "text", "contact_phone" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
    con.contact_phone
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
$_$;

ALTER FUNCTION "public"."get_public_hotel"("_identifier" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") RETURNS TABLE("id" "text", "name" "text", "image" "text", "cover_image" "text", "city" "text", "country" "text", "currency" "text", "status" "text", "vat" numeric, "opening_time" time without time zone, "closing_time" time without time zone, "schedule_type" "text", "days_of_week" integer[], "recurrence_interval" integer, "recurring_start_date" "date", "recurring_end_date" "date", "venue_type" "text", "description" "text", "landing_subtitle" "text", "offert" boolean, "slot_interval" integer, "booking_hold_enabled" boolean, "booking_hold_duration_minutes" integer, "allow_out_of_hours_booking" boolean, "out_of_hours_surcharge_percent" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    COALESCE(h.booking_hold_enabled, true),
    COALESCE(h.booking_hold_duration_minutes, 5),
    COALESCE(h.allow_out_of_hours_booking, false),
    COALESCE(h.out_of_hours_surcharge_percent, 0)
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;

ALTER FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_hotels"() RETURNS TABLE("id" "text", "name" "text", "image" "text", "cover_image" "text", "city" "text", "country" "text", "currency" "text", "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status
  FROM public.hotels h
  WHERE LOWER(h.status) IN ('active', 'actif')
  ORDER BY h.name;
$$;

ALTER FUNCTION "public"."get_public_hotels"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_therapists"("_hotel_id" "text") RETURNS TABLE("id" "text", "first_name" "text", "profile_image" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.id, t.first_name, t.profile_image
  FROM public.therapists t
  INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
  -- LOWER() : l'ancien IN ('Active','Actif','active') était sensible à la casse
  -- et divergeait du filtre de reserve_trunk_atomically.
  WHERE tv.hotel_id = _hotel_id AND LOWER(t.status) IN ('active', 'actif')
  ORDER BY t.first_name;
$$;

ALTER FUNCTION "public"."get_public_therapists"("_hotel_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_treatment_addons"("_parent_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "name_en" "text", "description" "text", "description_en" "text", "category" "text", "duration" integer, "price" numeric, "price_on_request" boolean, "image" "text", "currency" "text", "sort_order" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    t.id,
    t.name,
    t.name_en,
    t.description,
    t.description_en,
    t.category,
    t.duration,
    t.price,
    t.price_on_request,
    t.image,
    t.currency,
    ta.sort_order
  FROM public.treatment_addons ta
  JOIN public.treatment_menus t
    ON t.id = ta.addon_treatment_id
  WHERE ta.parent_treatment_id = _parent_id
    AND t.status = 'active'
  ORDER BY ta.sort_order, t.name;
$$;

ALTER FUNCTION "public"."get_public_treatment_addons"("_parent_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_treatments"("_hotel_id" "text") RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "name_en" "text", "description" "text", "description_en" "text", "category" "text", "service_for" "text", "duration" integer, "price" numeric, "price_on_request" boolean, "lead_time" integer, "image" "text", "sort_order" integer, "currency" "text", "is_bestseller" boolean, "is_addon" boolean, "is_bundle" boolean, "bundle_id" "uuid", "available_days" integer[], "amenity_id" "uuid", "amenity_type" "text", "variants" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    t.id, t.slug, t.name, t.name_en,
    t.description, t.description_en,
    t.category, t.service_for,
    t.duration, t.price, t.price_on_request,
    t.lead_time, t.image, t.sort_order,
    t.currency, t.is_bestseller,
    (COALESCE(t.is_addon, false) OR COALESCE(tc.is_addon, false)) AS is_addon,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id,
    t.available_days,
    t.amenity_id,
    va.type AS amenity_type,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id, 'label', v.label, 'label_en', v.label_en,
          'duration', v.duration, 'price', v.price,
          'price_on_request', v.price_on_request,
          'is_default', v.is_default, 'sort_order', v.sort_order,
          'guest_count', v.guest_count
        ) ORDER BY v.sort_order, v.guest_count, v.duration
       )
       FROM public.treatment_variants v
       WHERE v.treatment_id = t.id AND v.status = 'active'),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  LEFT JOIN public.venue_amenities va
    ON va.id = t.amenity_id
  WHERE t.status = 'active' AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

ALTER FUNCTION "public"."get_public_treatments"("_hotel_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_room_next_booking_gap"("_room_id" "uuid", "_booking_date" "date", "_booking_end_time" time without time zone, "_current_booking_id" "uuid") RETURNS TABLE("next_booking_time" time without time zone, "gap_minutes" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.booking_time::TIME AS next_booking_time,
    EXTRACT(EPOCH FROM (b.booking_time::TIME - _booking_end_time))::INT / 60 AS gap_minutes
  FROM bookings b
  WHERE b.room_id = _room_id
    AND b.booking_date = _booking_date
    AND b.booking_time::TIME > _booking_end_time
    AND b.id != _current_booking_id
    AND b.status NOT IN ('cancelled', 'noshow')
  ORDER BY b.booking_time::TIME ASC
  LIMIT 1;
END;
$$;

ALTER FUNCTION "public"."get_room_next_booking_gap"("_room_id" "uuid", "_booking_date" "date", "_booking_end_time" time without time zone, "_current_booking_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date" DEFAULT (CURRENT_DATE - '30 days'::interval), "_end_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("hotel_id" "text", "hotel_name" "text", "session_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id::TEXT AS hotel_id,
    h.name::TEXT AS hotel_name,
    COUNT(DISTINCT ca.session_id)::BIGINT AS session_count
  FROM public.client_analytics ca
  JOIN public.hotels h ON h.id = ca.hotel_id
  WHERE ca.created_at >= _start_date
    AND ca.created_at < _end_date + INTERVAL '1 day'
  GROUP BY h.id, h.name
  ORDER BY session_count DESC;
END;
$$;

ALTER FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_therapist_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.therapists WHERE user_id = _user_id LIMIT 1;
$$;

ALTER FUNCTION "public"."get_therapist_id"("_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_timezone"("_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT timezone FROM profiles WHERE user_id = _user_id),
    'Europe/Paris'
  );
$$;

ALTER FUNCTION "public"."get_user_timezone"("_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_venue_available_dates"("_hotel_id" "text", "_start_date" "text", "_end_date" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _available_dates TEXT[] := ARRAY[]::TEXT[];
  _current_date DATE;
BEGIN
  _current_date := _start_date::DATE;

  WHILE _current_date <= _end_date::DATE LOOP
    IF public.is_venue_available_on_date(_hotel_id, _current_date) THEN
      _available_dates := array_append(_available_dates, _current_date::TEXT);
    END IF;
    _current_date := _current_date + INTERVAL '1 day';
  END LOOP;

  RETURN _available_dates;
END;
$$;

ALTER FUNCTION "public"."get_venue_available_dates"("_hotel_id" "text", "_start_date" "text", "_end_date" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Find matching admin by email and update their user_id
  UPDATE public.admins
  SET
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Find matching concierge by email and update their user_id
  UPDATE public.concierges
  SET
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'concierge')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Find matching therapist by email and update their user_id
  UPDATE public.therapists
  SET
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'therapist')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."hotels_autofill_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.slug IS NULL OR LENGTH(TRIM(NEW.slug)) = 0 THEN
    NEW.slug := public.generate_unique_hotel_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."hotels_autofill_slug"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_booking_participant"("_booking_id" "uuid", "_therapist_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id
      AND therapist_id = _therapist_id
      AND status = 'accepted'
  );
$$;

ALTER FUNCTION "public"."is_booking_participant"("_booking_id" "uuid", "_therapist_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _schedule RECORD;
  _day_of_week INTEGER;
  _weeks_since_start INTEGER;
  _start_date DATE;
BEGIN
  -- Fetch the schedule for this venue
  SELECT
    schedule_type,
    days_of_week,
    recurring_start_date,
    recurring_end_date,
    specific_dates,
    COALESCE(recurrence_interval, 1) as recurrence_interval
  INTO _schedule
  FROM public.venue_deployment_schedules
  WHERE hotel_id = _hotel_id;

  -- If no schedule found, assume always available (backward compatibility)
  IF _schedule IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Handle always_open: venue is always available
  IF _schedule.schedule_type = 'always_open' THEN
    RETURN TRUE;
  END IF;

  -- Handle specific_days with recurrence interval
  IF _schedule.schedule_type = 'specific_days' THEN
    _start_date := COALESCE(_schedule.recurring_start_date, CURRENT_DATE);

    -- Check if we're before the start date
    IF _check_date < _start_date THEN
      RETURN FALSE;
    END IF;

    -- Check if we're after the end date
    IF _schedule.recurring_end_date IS NOT NULL AND _check_date > _schedule.recurring_end_date THEN
      RETURN FALSE;
    END IF;

    -- Check if the day of week matches (0=Sunday, 1=Monday, etc.)
    _day_of_week := EXTRACT(DOW FROM _check_date)::INTEGER;

    IF _schedule.days_of_week IS NULL OR NOT (_day_of_week = ANY(_schedule.days_of_week)) THEN
      RETURN FALSE;
    END IF;

    -- Check recurrence interval
    -- Week 0 is the start week, then every N weeks after
    IF _schedule.recurrence_interval > 1 THEN
      _weeks_since_start := FLOOR((_check_date - _start_date) / 7)::INTEGER;
      IF (_weeks_since_start % _schedule.recurrence_interval) != 0 THEN
        RETURN FALSE;
      END IF;
    END IF;

    RETURN TRUE;
  END IF;

  -- Handle one_time: check if date is in the specific_dates array
  IF _schedule.schedule_type = 'one_time' THEN
    RETURN _schedule.specific_dates IS NOT NULL AND _check_date = ANY(_schedule.specific_dates);
  END IF;

  -- Default: not available
  RETURN FALSE;
END;
$$;

ALTER FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."log_booking_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _old JSONB := '{}'::jsonb;
  _new JSONB := '{}'::jsonb;
  _changed BOOLEAN := false;
BEGIN
  -- On INSERT: log the initial creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (
      table_name, record_id, changed_by, change_type,
      old_values, new_values, source, metadata
    ) VALUES (
      'bookings',
      NEW.id::text,
      auth.uid(),
      'insert',
      NULL,
      jsonb_build_object(
        'status', NEW.status,
        'payment_status', NEW.payment_status,
        'therapist_name', NEW.therapist_name,
        'booking_date', NEW.booking_date,
        'booking_time', NEW.booking_time,
        'total_price', NEW.total_price
      ),
      'admin',
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'therapist_id', COALESCE(NEW.therapist_id::text, '')
      )
    );
    RETURN NEW;
  END IF;

  -- Compare each tracked field; record only those that changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _old := _old || jsonb_build_object('status', OLD.status);
    _new := _new || jsonb_build_object('status', NEW.status);
    _changed := true;
  END IF;

  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    _old := _old || jsonb_build_object('payment_status', OLD.payment_status);
    _new := _new || jsonb_build_object('payment_status', NEW.payment_status);
    _changed := true;
  END IF;

  IF OLD.therapist_id IS DISTINCT FROM NEW.therapist_id THEN
    _old := _old || jsonb_build_object('therapist_id', OLD.therapist_id, 'therapist_name', OLD.therapist_name);
    _new := _new || jsonb_build_object('therapist_id', NEW.therapist_id, 'therapist_name', NEW.therapist_name);
    _changed := true;
  END IF;

  IF OLD.booking_date IS DISTINCT FROM NEW.booking_date THEN
    _old := _old || jsonb_build_object('booking_date', OLD.booking_date);
    _new := _new || jsonb_build_object('booking_date', NEW.booking_date);
    _changed := true;
  END IF;

  IF OLD.booking_time IS DISTINCT FROM NEW.booking_time THEN
    _old := _old || jsonb_build_object('booking_time', OLD.booking_time);
    _new := _new || jsonb_build_object('booking_time', NEW.booking_time);
    _changed := true;
  END IF;

  IF OLD.duration IS DISTINCT FROM NEW.duration THEN
    _old := _old || jsonb_build_object('duration', OLD.duration);
    _new := _new || jsonb_build_object('duration', NEW.duration);
    _changed := true;
  END IF;

  IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
    _old := _old || jsonb_build_object('total_price', OLD.total_price);
    _new := _new || jsonb_build_object('total_price', NEW.total_price);
    _changed := true;
  END IF;

  IF OLD.payment_method IS DISTINCT FROM NEW.payment_method THEN
    _old := _old || jsonb_build_object('payment_method', OLD.payment_method);
    _new := _new || jsonb_build_object('payment_method', NEW.payment_method);
    _changed := true;
  END IF;

  IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    _old := _old || jsonb_build_object('room_id', OLD.room_id);
    _new := _new || jsonb_build_object('room_id', NEW.room_id);
    _changed := true;
  END IF;

  -- Skip if nothing tracked changed
  IF NOT _changed THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata
  ) VALUES (
    'bookings',
    NEW.id::text,
    auth.uid(),
    'update',
    _old,
    _new,
    'admin',
    jsonb_build_object(
      'booking_id', NEW.booking_id,
      'therapist_id', COALESCE(NEW.therapist_id::text, '')
    )
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."log_booking_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."prevent_overlapping_treatment_room_bookings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _new_start       INTEGER;
  _new_end         INTEGER;
  _turnover_buffer INTEGER;
  _room_ids        UUID[];
BEGIN
  IF NEW.room_id IS NULL AND NEW.secondary_room_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow') THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'awaiting_payment'
     AND NEW.created_at < NOW() - INTERVAL '10 minutes'
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.hotel_id::text || ':' || NEW.booking_date::text));

  _new_start := EXTRACT(HOUR FROM NEW.booking_time) * 60 + EXTRACT(MINUTE FROM NEW.booking_time);
  _new_end   := _new_start + COALESCE(NEW.duration, 30);

  SELECT COALESCE(room_turnover_buffer_minutes, 0)
  INTO _turnover_buffer
  FROM hotels
  WHERE id = NEW.hotel_id;

  _room_ids := array_remove(ARRAY[NEW.room_id, NEW.secondary_room_id], NULL::uuid);

  IF EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.id <> NEW.id
      AND b.hotel_id = NEW.hotel_id
      AND b.booking_date = NEW.booking_date
      AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
      AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
      AND (b.room_id = ANY(_room_ids) OR b.secondary_room_id = ANY(_room_ids))
      AND (
        _new_start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30) + _turnover_buffer
        AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
      )
  ) THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_overlapping_treatment_room_bookings"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."log_therapist_availability_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _source TEXT;
  _affected_date DATE;
  _therapist_id UUID;
  _old_values JSONB;
  _new_values JSONB;
  _is_red_flag BOOLEAN;
  _record_id TEXT;
BEGIN
  -- Determine source
  IF TG_OP = 'DELETE' THEN
    _source := COALESCE(OLD.last_change_source, 'unknown');
    _affected_date := OLD.date;
    _therapist_id := OLD.therapist_id;
    _record_id := OLD.id::text;
  ELSE
    _source := COALESCE(NEW.last_change_source, 'unknown');
    _affected_date := NEW.date;
    _therapist_id := NEW.therapist_id;
    _record_id := NEW.id::text;
  END IF;

  -- Skip template applications (bulk operations)
  IF _source = 'template_apply' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Skip if no meaningful fields changed (UPDATE only)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_available IS NOT DISTINCT FROM NEW.is_available
       AND OLD.shifts IS NOT DISTINCT FROM NEW.shifts
       AND OLD.is_manually_edited IS NOT DISTINCT FROM NEW.is_manually_edited THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build old/new values
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _old_values := jsonb_build_object(
      'is_available', OLD.is_available,
      'shifts', OLD.shifts,
      'is_manually_edited', OLD.is_manually_edited
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _new_values := jsonb_build_object(
      'is_available', NEW.is_available,
      'shifts', NEW.shifts,
      'is_manually_edited', NEW.is_manually_edited
    );
  END IF;

  -- Red flag: affected date is less than 14 days from now
  _is_red_flag := (_affected_date < CURRENT_DATE + INTERVAL '14 days');

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata,
    is_flagged, flag_type
  ) VALUES (
    'therapist_availability',
    _record_id,
    auth.uid(),
    lower(TG_OP),
    _old_values,
    _new_values,
    _source,
    jsonb_build_object('therapist_id', _therapist_id::text, 'affected_date', _affected_date::text),
    _is_red_flag,
    CASE WHEN _is_red_flag THEN 'short_notice' ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."log_therapist_availability_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."lookup_gift_card_by_code"("_code" "text", "_attempt_key" "text") RETURNS TABLE("bundle_type" "text", "title" "text", "title_en" "text", "cover_image_url" "text", "sender_name" "text", "gift_message" "text", "total_sessions" integer, "total_amount_cents" integer, "expires_at" "date", "hotel_id" "text", "hotel_name" "text", "already_claimed" boolean, "is_gift" boolean, "is_active" boolean, "hotel_image" "text", "hotel_cover_image" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _attempts INTEGER;
  _ctb_id UUID;
  _ctb customer_treatment_bundles%ROWTYPE;
  _tb treatment_bundles%ROWTYPE;
  _hotel hotels%ROWTYPE;
BEGIN
  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));
  IF length(_code) <> 10 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;
  IF _attempt_key IS NULL OR length(_attempt_key) < 3 THEN
    RAISE EXCEPTION 'Missing attempt key';
  END IF;

  SELECT COUNT(*) INTO _attempts
  FROM gift_code_attempts
  WHERE attempt_key = _attempt_key
    AND created_at > now() - interval '5 minutes';

  IF _attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts, please retry later';
  END IF;

  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  -- Look up any card with this code (self-purchase or gift)
  SELECT id INTO _ctb_id
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
  LIMIT 1;

  IF _ctb_id IS NULL THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;

  SELECT * INTO _ctb FROM customer_treatment_bundles WHERE id = _ctb_id;
  SELECT * INTO _tb FROM treatment_bundles WHERE id = _ctb.bundle_id;
  SELECT * INTO _hotel FROM hotels WHERE id = _ctb.hotel_id;

  UPDATE gift_code_attempts
  SET succeeded = true
  WHERE id = (SELECT id FROM gift_code_attempts WHERE attempt_key = _attempt_key ORDER BY created_at DESC LIMIT 1);

  RETURN QUERY
  SELECT
    _tb.bundle_type,
    COALESCE(_tb.title, _tb.name),
    COALESCE(_tb.title_en, _tb.name_en),
    _tb.cover_image_url,
    _ctb.sender_name,
    _ctb.gift_message,
    _ctb.total_sessions,
    _ctb.total_amount_cents,
    _ctb.expires_at,
    _ctb.hotel_id,
    _hotel.name,
    (_ctb.claimed_at IS NOT NULL),
    _ctb.is_gift,
    (_ctb.beneficiary_customer_id IS NOT NULL AND _ctb.status = 'active' AND _ctb.expires_at >= CURRENT_DATE),
    _hotel.image,
    _hotel.cover_image;
END;
$$;

ALTER FUNCTION "public"."lookup_gift_card_by_code"("_code" "text", "_attempt_key" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."merge_customer_profiles"("_new_customer_id" "uuid", "_existing_customer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid UUID;
  _new_auth UUID;
  _existing_auth UUID;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT auth_user_id INTO _new_auth FROM customers WHERE id = _new_customer_id;
  IF _new_auth IS NULL OR _new_auth <> _uid THEN
    RAISE EXCEPTION 'Unauthorized merge';
  END IF;

  SELECT auth_user_id INTO _existing_auth FROM customers WHERE id = _existing_customer_id;
  IF _existing_auth IS NOT NULL AND _existing_auth <> _uid THEN
    RAISE EXCEPTION 'Target profile is already linked to a different account';
  END IF;

  UPDATE customer_treatment_bundles
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _existing_customer_id
  WHERE beneficiary_customer_id = _new_customer_id;

  UPDATE bookings
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customers
  SET auth_user_id = _uid,
      profile_completed = true,
      updated_at = now()
  WHERE id = _existing_customer_id;

  DELETE FROM customers WHERE id = _new_customer_id;
END;
$$;

ALTER FUNCTION "public"."merge_customer_profiles"("_new_customer_id" "uuid", "_existing_customer_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."next_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  seq_val BIGINT;
  year_part TEXT;
BEGIN
  seq_val := nextval('invoice_number_seq');
  year_part := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'F-' || year_part || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

ALTER FUNCTION "public"."next_invoice_number"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_admins_on_completion_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  admin_record RECORD;
BEGIN
  IF NEW.status = 'awaiting_validation' AND (OLD.status IS NULL OR OLD.status != 'awaiting_validation') THEN
    FOR admin_record IN (
      SELECT a.user_id, a.first_name, a.last_name
      FROM public.admins a
      WHERE a.user_id IS NOT NULL
        AND a.status = 'active'
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        admin_record.user_id,
        NEW.id,
        'completion_request',
        'Demande de validation pour la réservation #' || NEW.booking_id || 
        ' - ' || NEW.client_first_name || ' ' || NEW.client_last_name || 
        ' à ' || COALESCE(NEW.hotel_name, 'l''hôtel') || 
        ' le ' || TO_CHAR(NEW.booking_date, 'DD/MM/YYYY')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_admins_on_completion_request"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_hairdresser_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_user_id UUID;
BEGIN
  IF NEW.therapist_id IS NOT NULL AND
     (OLD.therapist_id IS NULL OR OLD.therapist_id != NEW.therapist_id) THEN

    SELECT user_id INTO therapist_user_id
    FROM public.therapists
    WHERE id = NEW.therapist_id;

    IF therapist_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, booking_id, type, message)
      VALUES (
        therapist_user_id,
        NEW.id,
        'booking_assigned',
        'Vous avez été assigné(e) à la réservation #' || NEW.booking_id ||
        ' pour le ' || TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') ||
        ' à ' || TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_hairdresser_on_assignment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_hairdresser_on_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_user_id UUID;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.therapist_id IS NOT NULL THEN
    SELECT user_id INTO therapist_user_id
    FROM public.therapists
    WHERE id = NEW.therapist_id;

    IF therapist_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, booking_id, type, message)
      VALUES (
        therapist_user_id,
        NEW.id,
        'booking_cancelled',
        'La réservation #' || NEW.booking_id || ' a été annulée' ||
        CASE
          WHEN NEW.cancellation_reason IS NOT NULL AND NEW.cancellation_reason != ''
          THEN '. Raison : ' || NEW.cancellation_reason
          ELSE ''
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_hairdresser_on_cancellation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_hairdressers_new_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_record RECORD;
BEGIN
  IF NEW.status = 'pending' THEN
    FOR therapist_record IN (
      SELECT t.user_id, t.first_name, t.last_name
      FROM public.therapists t
      INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
      WHERE tv.hotel_id = NEW.hotel_id
        AND t.user_id IS NOT NULL
        AND t.status = 'active'
    ) LOOP
      INSERT INTO public.notifications (user_id, booking_id, type, message)
      VALUES (
        therapist_record.user_id,
        NEW.id,
        'new_booking',
        'Nouvelle réservation #' || NEW.booking_id || ' à ' ||
        COALESCE(NEW.hotel_name, 'l''hôtel') || ' pour le ' ||
        TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') || ' à ' ||
        TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_hairdressers_new_booking"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_hairdressers_on_unassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_record RECORD;
BEGIN
  IF OLD.therapist_id IS NOT NULL AND
     NEW.therapist_id IS NULL AND
     NEW.status = 'pending' THEN

    FOR therapist_record IN (
      SELECT t.user_id, t.first_name, t.last_name, t.id
      FROM public.therapists t
      INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
      WHERE tv.hotel_id = NEW.hotel_id
        AND t.user_id IS NOT NULL
        AND t.status = 'active'
        AND NOT (t.id = ANY(COALESCE(NEW.declined_by, ARRAY[]::uuid[])))
    ) LOOP
      INSERT INTO public.notifications (user_id, booking_id, type, message)
      VALUES (
        therapist_record.user_id,
        NEW.id,
        'booking_reproposed',
        'La réservation #' || NEW.booking_id || ' est à nouveau disponible à ' ||
        COALESCE(NEW.hotel_name, 'l''hôtel') || ' pour le ' ||
        TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') || ' à ' ||
        TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_hairdressers_on_unassignment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reactivate_prereservation"("_booking_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _booking RECORD;
  _new_start INTEGER;
  _new_end INTEGER;
  _has_conflict BOOLEAN;
BEGIN
  -- Fetch the cancelled booking
  SELECT * INTO _booking FROM bookings WHERE id = _booking_id;

  IF _booking IS NULL OR _booking.status NOT IN ('cancelled', 'Annulé') THEN
    RETURN false;
  END IF;

  -- Lock active bookings for this hotel+date (exclude self)
  PERFORM id FROM bookings
  WHERE hotel_id = _booking.hotel_id
    AND booking_date = _booking.booking_date
    AND id != _booking_id
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '10 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking.booking_time) * 60 + EXTRACT(MINUTE FROM _booking.booking_time);
  _new_end := _new_start + COALESCE(_booking.duration, 30);

  -- Check room time conflict
  SELECT EXISTS(
    SELECT 1 FROM bookings
    WHERE hotel_id = _booking.hotel_id
      AND booking_date = _booking.booking_date
      AND room_id = _booking.room_id
      AND id != _booking_id
      AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
      AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '10 minutes')
      AND (
        _new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
        AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time))
      )
  ) INTO _has_conflict;

  IF _has_conflict THEN
    RETURN false;
  END IF;

  -- Reactivate the booking
  UPDATE bookings
  SET status = 'pending',
      payment_status = 'paid',
      cancellation_reason = NULL
  WHERE id = _booking_id;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."reactivate_prereservation"("_booking_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text" DEFAULT NULL::"text", "_therapist_gender" "text" DEFAULT NULL::"text", "_stripe_session_id" "text" DEFAULT NULL::"text", "_guest_count" integer DEFAULT 1, "_amenity_timing" "text" DEFAULT 'same'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _booking_id            UUID;
  _room                  RECORD;
  _new_start             INTEGER;
  _new_end               INTEGER;
  _has_conflict          BOOLEAN;
  _room_blocked          BOOLEAN;
  _required_treatments   UUID[];
  _required_count        INTEGER := 0;
  _therapist_id          UUID := NULL;
  _solo_therapist_id     UUID := NULL;
  _covered_count         INTEGER;
  _travel_buffer         INTEGER;
  _turnover_buffer       INTEGER;
  _requested_dow         INTEGER;
  _treatment_record      RECORD;
  _is_duo                BOOLEAN;
  _guests                INTEGER;
  _qualified_available   INTEGER;
  _primary_room_id       UUID := NULL;
  _secondary_room_id     UUID := NULL;
  _remaining             INTEGER;
  _free                  INTEGER;
  _has_soin              BOOLEAN;
  _am                    RECORD;
  _am_occ                INTEGER;
  _am_start              TIME;
  _am_end                TIME;
  _soin_duration         INTEGER := 0;
BEGIN
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id      := NULLIF(NULLIF(NULLIF(_customer_id,     'undefined'), 'null'), '');
  _guests           := GREATEST(1, COALESCE(_guest_count, 1));
  _is_duo           := _guests > 1;

  -- Anti-race lock: block concurrent writes on same hotel+date.
  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '10 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end   := _new_start + COALESCE(_duration, 30);

  SELECT COALESCE(inter_venue_buffer_minutes, 0),
         COALESCE(room_turnover_buffer_minutes, 0)
  INTO _travel_buffer, _turnover_buffer
  FROM hotels WHERE id::text = _hotel_id;

  _requested_dow := EXTRACT(DOW FROM _booking_date)::integer;

  -- Day-of-week constraint check per treatment.
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    FOR _treatment_record IN
      SELECT name, available_days FROM treatment_menus WHERE id::text = ANY(_treatment_ids)
    LOOP
      IF _treatment_record.available_days IS NOT NULL
         AND array_length(_treatment_record.available_days, 1) > 0
         AND NOT _requested_dow = ANY(_treatment_record.available_days)
      THEN
        RAISE EXCEPTION 'DAY_CONSTRAINT_VIOLATION: Le soin "%" n''est pas disponible ce jour-là.', _treatment_record.name;
      END IF;
    END LOOP;
  END IF;

  -- Un booking a besoin de salle/thérapeute uniquement s'il contient au moins un
  -- vrai soin (treatment sans amenity_id). Un booking 100% amenity ne consomme ni
  -- salle ni thérapeute : seule la capacité de l'amenity compte.
  _has_soin := EXISTS (
    SELECT 1 FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids) AND amenity_id IS NULL
  );

  -- Durée cumulée des vrais soins (hors amenity) : sert de référence pour placer
  -- un accès amenity « après » le soin (_am_start = booking_time + durée soin).
  SELECT COALESCE(SUM(duration), 0)::INTEGER INTO _soin_duration
  FROM treatment_menus
  WHERE id::text = ANY(_treatment_ids) AND amenity_id IS NULL;

  -- ----- Capacité amenity : verrou + contrôle atomique (avant tout insert) -----
  FOR _am IN
    SELECT tm.amenity_id, tm.duration AS am_duration, tm.price AS am_price, va.capacity_per_slot
    FROM treatment_menus tm
    JOIN venue_amenities va ON va.id = tm.amenity_id
    WHERE tm.id::text = ANY(_treatment_ids) AND tm.amenity_id IS NOT NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(_am.amenity_id::text || ':' || _booking_date::text));
    -- Placement de l'accès par rapport au soin (collé, sans trou) :
    --   before → l'accès se termine au début du soin ; after → l'accès démarre à
    --   la fin du soin ; same (défaut) → même horaire que le soin.
    _am_start := CASE _amenity_timing
      WHEN 'before' THEN (_booking_time - make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time
      WHEN 'after'  THEN (_booking_time + make_interval(mins => _soin_duration))::time
      ELSE _booking_time
    END;
    _am_end := (_am_start + make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time;
    SELECT COALESCE(SUM(num_guests), 0)::INTEGER INTO _am_occ
    FROM amenity_bookings
    WHERE venue_amenity_id = _am.amenity_id
      AND booking_date = _booking_date
      AND status NOT IN ('cancelled')
      AND booking_time < _am_end
      AND end_time > _am_start;
    IF _am_occ + _guests > _am.capacity_per_slot THEN
      RAISE EXCEPTION 'AMENITY_FULL';
    END IF;
  END LOOP;

  IF _has_soin THEN
    IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
      -- Add-ons are supplements, not soins: they must never impose a requirement
      -- on the therapist. Amenities have no therapist either.
      SELECT array_agg(DISTINCT id) INTO _required_treatments
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
        AND COALESCE(is_addon, false) = false
        AND amenity_id IS NULL;
      _required_count := COALESCE(array_length(_required_treatments, 1), 0);
    END IF;

    -- Le filtre individuel ci-dessous et le comptage _qualified_available
    -- partagent la même boucle, donc le même prédicat par construction.
    _qualified_available := 0;
    FOR _therapist_id IN
      SELECT t.id
      FROM therapist_venues tv
      JOIN therapists t ON t.id = tv.therapist_id
      WHERE tv.hotel_id::text = _hotel_id
        AND LOWER(t.status) IN ('active', 'actif')
        AND (
          _is_duo
          OR _therapist_gender IS NULL
          OR LOWER(t.gender) = LOWER(_therapist_gender)
        )
    LOOP
      -- Qualification : un thérapeute sans aucune association reste polyvalent
      -- (comportement hérité de skills) ; dès qu'il en a au moins une, il doit
      -- couvrir toutes les prestations requises.
      IF _required_count > 0
         AND EXISTS (SELECT 1 FROM therapist_treatments WHERE therapist_id = _therapist_id)
      THEN
        SELECT COUNT(*) INTO _covered_count
        FROM therapist_treatments
        WHERE therapist_id = _therapist_id
          AND treatment_menu_id = ANY(_required_treatments);
        IF _covered_count < _required_count THEN CONTINUE; END IF;
      END IF;

      IF EXISTS (
        SELECT 1 FROM therapist_availability ta
        WHERE ta.therapist_id = _therapist_id
          AND ta.date = _booking_date
          AND ta.is_available = false
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM therapist_availability ta
        WHERE ta.therapist_id = _therapist_id
          AND ta.date = _booking_date
          AND ta.is_available = true
          AND ta.shifts IS NOT NULL
          AND jsonb_array_length(ta.shifts) > 0
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(ta.shifts) AS shift
            WHERE _new_start >= (
              (split_part(shift->>'start', ':', 1)::int * 60)
              + COALESCE(NULLIF(split_part(shift->>'start', ':', 2), '')::int, 0)
            )
            AND _new_start < (
              (split_part(shift->>'end', ':', 1)::int * 60)
              + COALESCE(NULLIF(split_part(shift->>'end', ':', 2), '')::int, 0)
            )
          )
      ) THEN
        CONTINUE;
      END IF;

      SELECT EXISTS(
        SELECT 1 FROM bookings b
        LEFT JOIN hotels h ON h.id = b.hotel_id
        WHERE b.therapist_id = _therapist_id
          AND b.booking_date = _booking_date
          AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
          AND (
            _new_start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
                          + COALESCE(b.duration, 30)
                          + CASE WHEN b.hotel_id::text != _hotel_id
                                 THEN GREATEST(_travel_buffer, COALESCE(h.inter_venue_buffer_minutes, 0))
                                 ELSE _turnover_buffer END
            AND
            _new_end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
                        - CASE WHEN b.hotel_id::text != _hotel_id
                               THEN GREATEST(_travel_buffer, COALESCE(h.inter_venue_buffer_minutes, 0))
                               ELSE 0 END
          )
      ) INTO _has_conflict;

      IF NOT _has_conflict THEN
        _qualified_available := _qualified_available + 1;
        IF _solo_therapist_id IS NULL THEN
          _solo_therapist_id := _therapist_id;
        END IF;
      END IF;
    END LOOP;

    IF _qualified_available < _guests THEN
      RAISE EXCEPTION 'NO_ROOM_AVAILABLE';
    END IF;

    _remaining := _guests;
    <<room_loop>>
    FOR _room IN
      SELECT id, capacity FROM treatment_rooms
      WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
      ORDER BY id
    LOOP
      SELECT EXISTS(
        SELECT 1
        FROM bookings b
        WHERE (b.room_id = _room.id OR b.secondary_room_id = _room.id)
          AND b.booking_date = _booking_date
          AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
          AND (
            _new_start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30) + _turnover_buffer
            AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
          )
      ) INTO _room_blocked;

      IF _room_blocked THEN CONTINUE room_loop; END IF;

      _free := GREATEST(1, COALESCE(_room.capacity, 1));

      IF _primary_room_id IS NULL THEN
        _primary_room_id := _room.id;
        _remaining := _remaining - LEAST(_remaining, _free);
      ELSE
        _secondary_room_id := _room.id;
        _remaining := _remaining - LEAST(_remaining, _free);
      END IF;

      EXIT room_loop WHEN _remaining <= 0;
    END LOOP;

    IF _primary_room_id IS NULL OR _remaining > 0 THEN
      RAISE EXCEPTION 'NO_ROOM_AVAILABLE';
    END IF;
  END IF;

  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, secondary_room_id, therapist_id, total_price, duration,
    room_number, customer_id, payment_method, payment_status, language, guest_count,
    therapist_gender_preference
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _primary_room_id, _secondary_room_id,
    CASE WHEN _is_duo THEN NULL ELSE _solo_therapist_id END,
    _total_price, _duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language,
    _guests,
    CASE WHEN NOT _is_duo THEN _therapist_gender ELSE NULL END
  ) RETURNING id INTO _booking_id;

  -- ----- Insert des amenity_bookings liés (capacité déjà verrouillée ci-dessus) -----
  FOR _am IN
    SELECT tm.amenity_id, tm.duration AS am_duration, tm.price AS am_price
    FROM treatment_menus tm
    WHERE tm.id::text = ANY(_treatment_ids) AND tm.amenity_id IS NOT NULL
  LOOP
    -- Même placement que dans le contrôle de capacité ci-dessus (before/after/same).
    _am_start := CASE _amenity_timing
      WHEN 'before' THEN (_booking_time - make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time
      WHEN 'after'  THEN (_booking_time + make_interval(mins => _soin_duration))::time
      ELSE _booking_time
    END;
    _am_end := (_am_start + make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time;
    INSERT INTO amenity_bookings (
      hotel_id, venue_amenity_id, booking_date, booking_time, duration, end_time,
      customer_id, client_type, room_number, linked_booking_id, num_guests,
      price, payment_method, payment_status, status
    ) VALUES (
      _hotel_id, _am.amenity_id, _booking_date, _am_start,
      COALESCE(_am.am_duration, _duration, 60), _am_end,
      CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
      'external',
      NULLIF(_room_number, 'TBD'),
      _booking_id,
      _guests,
      COALESCE(_am.am_price, 0),
      _payment_method,
      CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
      'confirmed'
    );
  END LOOP;

  RETURN _booking_id;
END;
$$;

ALTER FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text", "_guest_count" integer, "_amenity_timing" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_ticket_closed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.closed_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') AND OLD.status IN ('resolved', 'closed') THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_ticket_closed_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."slugify"("_input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT
    LEFT(
      TRIM(BOTH '-' FROM
        REGEXP_REPLACE(
          LOWER(public.unaccent(COALESCE(_input, ''))),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      60
    )
$$;

ALTER FUNCTION "public"."slugify"("_input" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_form_data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      client_form_data = p_form_data, -- Sauvegarde du JSON complet
      -- NOUVEAU : On extrait le numéro de chambre du JSON pour mettre à jour la vraie colonne
      room_number = COALESCE(NULLIF(p_form_data->>'room_number', ''), room_number),
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL  
    AND status IN ('pending', 'confirmed', 'ongoing'); 

  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_form_data" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_room_number" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE bookings
  SET 
    client_signature = p_signature,
    room_number = COALESCE(p_room_number, room_number), -- Met à jour la chambre si renseignée
    signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL
    AND status IN ('pending', 'confirmed', 'ongoing');

  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_room_number" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sync_profile_timezone_from_hotel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _user_id UUID;
  _hotel_timezone TEXT;
BEGIN
  IF TG_TABLE_NAME = 'concierge_hotels' THEN
    SELECT c.user_id INTO _user_id
    FROM concierges c
    WHERE c.id = NEW.concierge_id;

    SELECT h.timezone INTO _hotel_timezone
    FROM hotels h
    WHERE h.id = NEW.hotel_id;

  ELSIF TG_TABLE_NAME = 'therapist_venues' THEN
    SELECT t.user_id INTO _user_id
    FROM therapists t
    WHERE t.id = NEW.therapist_id;

    SELECT ht.timezone INTO _hotel_timezone
    FROM hotels ht
    WHERE ht.id = NEW.hotel_id;
  END IF;

  IF _user_id IS NOT NULL AND _hotel_timezone IS NOT NULL THEN
    INSERT INTO profiles (user_id, timezone)
    VALUES (_user_id, _hotel_timezone)
    ON CONFLICT (user_id)
    DO UPDATE SET timezone = _hotel_timezone, updated_at = now()
    WHERE profiles.timezone = 'Europe/Paris';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_profile_timezone_from_hotel"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."treatment_menus_autofill_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.slug IS NULL OR LENGTH(TRIM(NEW.slug)) = 0 THEN
    NEW.slug := public.generate_unique_treatment_slug(NEW.hotel_id, NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."treatment_menus_autofill_slug"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trigger_cancellation_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Only trigger if status changed to 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    -- Get URL and key from vault with proper secret names
    SELECT decrypted_secret INTO _supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL';
    
    SELECT decrypted_secret INTO _service_role_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
    
    -- Only proceed if we have both values
    IF _supabase_url IS NOT NULL AND _service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/handle-booking-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_role_key
        ),
        body := jsonb_build_object(
          'bookingId', NEW.id,
          'cancellationReason', NEW.cancellation_reason
        )
      );
    ELSE
      -- Log warning if secrets are missing
      RAISE WARNING 'Missing secrets for cancellation notification: URL=%, KEY=%', 
        CASE WHEN _supabase_url IS NULL THEN 'NULL' ELSE 'SET' END,
        CASE WHEN _service_role_key IS NULL THEN 'NULL' ELSE 'SET' END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_cancellation_notifications"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_therapist_id uuid;
  _current_declined_by uuid[];
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT therapist_id, COALESCE(declined_by, ARRAY[]::uuid[])
  INTO _current_therapist_id, _current_declined_by
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_therapist_id IS NULL OR _current_therapist_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_assigned_to_you');
  END IF;

  UPDATE bookings
  SET
    therapist_id = NULL,
    therapist_name = NULL,
    status = 'pending',
    assigned_at = NULL,
    declined_by = array_append(_current_declined_by, _hairdresser_id),
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;

ALTER FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_treatment_categories_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_treatment_categories_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _bundle customer_treatment_bundles%ROWTYPE;
  _bundle_template_id UUID;
  _is_eligible BOOLEAN;
  _usage_id UUID;
BEGIN
  -- Lock the customer bundle row to prevent race conditions
  SELECT * INTO _bundle
  FROM customer_treatment_bundles
  WHERE id = _customer_bundle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer bundle not found: %', _customer_bundle_id;
  END IF;

  IF _bundle.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle is not active (status: %)', _bundle.status;
  END IF;

  IF _bundle.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Bundle has expired (expires_at: %)', _bundle.expires_at;
  END IF;

  IF _bundle.used_sessions >= _bundle.total_sessions THEN
    RAISE EXCEPTION 'No remaining sessions on this bundle';
  END IF;

  -- Verify treatment is eligible for this bundle
  SELECT EXISTS (
    SELECT 1 FROM treatment_bundle_items
    WHERE bundle_id = _bundle.bundle_id
      AND treatment_id = _treatment_id
  ) INTO _is_eligible;

  IF NOT _is_eligible THEN
    RAISE EXCEPTION 'Treatment % is not eligible for this bundle', _treatment_id;
  END IF;

  -- Create the usage record
  INSERT INTO bundle_session_usages (customer_bundle_id, booking_id, treatment_id)
  VALUES (_customer_bundle_id, _booking_id, _treatment_id)
  RETURNING id INTO _usage_id;

  -- Increment used_sessions
  UPDATE customer_treatment_bundles
  SET used_sessions = used_sessions + 1,
      updated_at = now()
  WHERE id = _customer_bundle_id;

  -- Auto-complete if all sessions used
  IF _bundle.used_sessions + 1 >= _bundle.total_sessions THEN
    UPDATE customer_treatment_bundles
    SET status = 'completed',
        updated_at = now()
    WHERE id = _customer_bundle_id;
  END IF;

  -- Link the booking to this usage
  UPDATE bookings
  SET bundle_usage_id = _usage_id
  WHERE id = _booking_id;

  RETURN _usage_id;
END;
$$;

ALTER FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") IS 'Consumes one session from a customer bundle with row-level locking to prevent race conditions';

CREATE OR REPLACE FUNCTION "public"."use_gift_amount"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_amount_cents" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _ctb customer_treatment_bundles%ROWTYPE;
  _remaining INTEGER;
  _usage_id UUID;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE id = _customer_bundle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer bundle not found: %', _customer_bundle_id;
  END IF;
  IF _ctb.status <> 'active' THEN
    RAISE EXCEPTION 'Bundle is not active (status: %)', _ctb.status;
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Bundle has expired';
  END IF;
  IF _ctb.total_amount_cents IS NULL THEN
    RAISE EXCEPTION 'This bundle is not a monetary gift card';
  END IF;

  _remaining := _ctb.total_amount_cents - _ctb.used_amount_cents;
  IF _amount_cents > _remaining THEN
    RAISE EXCEPTION 'Insufficient balance: requested % cents, remaining % cents', _amount_cents, _remaining;
  END IF;

  INSERT INTO bundle_amount_usages (customer_bundle_id, booking_id, amount_cents_used)
  VALUES (_customer_bundle_id, _booking_id, _amount_cents)
  RETURNING id INTO _usage_id;

  UPDATE customer_treatment_bundles
  SET used_amount_cents = used_amount_cents + _amount_cents,
      updated_at = now()
  WHERE id = _customer_bundle_id;

  IF _ctb.used_amount_cents + _amount_cents >= _ctb.total_amount_cents THEN
    UPDATE customer_treatment_bundles
    SET status = 'completed', updated_at = now()
    WHERE id = _customer_bundle_id;
  END IF;

  UPDATE bookings
  SET gift_amount_applied_cents = gift_amount_applied_cents + _amount_cents
  WHERE id = _booking_id;

  RETURN _usage_id;
END;
$$;

ALTER FUNCTION "public"."use_gift_amount"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_amount_cents" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text" DEFAULT NULL::"text", "_description" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  -- Validate required fields
  IF _client_first_name IS NULL OR length(trim(_client_first_name)) < 2 THEN
    RAISE EXCEPTION 'Invalid first name: must be at least 2 characters';
  END IF;
  
  IF length(_client_first_name) > 100 THEN
    RAISE EXCEPTION 'Invalid first name: must be less than 100 characters';
  END IF;
  
  IF _client_phone IS NULL OR length(trim(_client_phone)) < 8 THEN
    RAISE EXCEPTION 'Invalid phone number: must be at least 8 characters';
  END IF;
  
  IF length(_client_phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone number: must be less than 20 characters';
  END IF;
  
  -- Validate hotel exists (case-insensitive status check)
  IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND LOWER(status) = 'active') THEN
    RAISE EXCEPTION 'Invalid hotel ID';
  END IF;
  
  -- Validate email format if provided
  IF _client_email IS NOT NULL AND _client_email != '' THEN
    IF _client_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Validate description length if provided
  IF _description IS NOT NULL AND length(_description) > 1000 THEN
    RAISE EXCEPTION 'Description must be less than 1000 characters';
  END IF;
  
  RETURN true;
END;
$_$;

ALTER FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "anon";

GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "authenticated";

GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "service_role";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alert"("_alert_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alert"("_alert_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alert"("_alert_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alerts_bulk"("_alert_ids" "uuid"[]) TO "anon";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alerts_bulk"("_alert_ids" "uuid"[]) TO "authenticated";

GRANT ALL ON FUNCTION "public"."acknowledge_audit_alerts_bulk"("_alert_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean) TO "anon";

GRANT ALL ON FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean) TO "authenticated";

GRANT ALL ON FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_schedule_completeness"("p_therapist_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_schedule_completeness"("p_therapist_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_incomplete_schedule_therapist_ids"("p_dedup_days" integer, "p_reminder_type" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."claim_gift_card"("_code" "text", "_email" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."claim_gift_card"("_code" "text", "_email" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."claim_gift_card"("_code" "text", "_email" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."claim_gift_card_public"("_code" "text", "_email" "text", "_first_name" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."claim_gift_card_public"("_code" "text", "_email" "text", "_first_name" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."claim_gift_card_public"("_code" "text", "_email" "text", "_first_name" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "anon";

GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "service_role";

GRANT ALL ON FUNCTION "public"."create_audit_log"("_table_name" "text", "_record_id" "text", "_change_type" "text", "_old_values" "jsonb", "_new_values" "jsonb", "_source" "text", "_metadata" "jsonb", "_is_flagged" boolean, "_flag_type" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."create_audit_log"("_table_name" "text", "_record_id" "text", "_change_type" "text", "_old_values" "jsonb", "_new_values" "jsonb", "_source" "text", "_metadata" "jsonb", "_is_flagged" boolean, "_flag_type" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_audit_log"("_table_name" "text", "_record_id" "text", "_change_type" "text", "_old_values" "jsonb", "_new_values" "jsonb", "_source" "text", "_metadata" "jsonb", "_is_flagged" boolean, "_flag_type" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_customer_bundle"("_customer_id" "uuid", "_bundle_id" "uuid", "_hotel_id" "text", "_booking_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."create_customer_gift_card"("_bundle_id" "uuid", "_purchaser_customer_id" "uuid", "_hotel_id" "text", "_is_gift" boolean, "_gift_delivery_mode" "text", "_sender_name" "text", "_sender_email" "text", "_recipient_name" "text", "_recipient_email" "text", "_gift_message" "text", "_payment_reference" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."create_customer_gift_card"("_bundle_id" "uuid", "_purchaser_customer_id" "uuid", "_hotel_id" "text", "_is_gift" boolean, "_gift_delivery_mode" "text", "_sender_name" "text", "_sender_email" "text", "_recipient_name" "text", "_recipient_email" "text", "_gift_message" "text", "_payment_reference" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_customer_gift_card"("_bundle_id" "uuid", "_purchaser_customer_id" "uuid", "_hotel_id" "text", "_is_gift" boolean, "_gift_delivery_mode" "text", "_sender_name" "text", "_sender_email" "text", "_recipient_name" "text", "_recipient_email" "text", "_gift_message" "text", "_payment_reference" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."create_therapist_absence"("_therapist_id" "uuid", "_start_date" "date", "_end_date" "date", "_reason" "text", "_note" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."create_therapist_absence"("_therapist_id" "uuid", "_start_date" "date", "_end_date" "date", "_reason" "text", "_note" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_therapist_absence"("_therapist_id" "uuid", "_start_date" "date", "_end_date" "date", "_reason" "text", "_note" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "anon";

GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."decline_booking"("_booking_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."decline_booking"("_booking_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_therapist_absence"("_absence_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."delete_therapist_absence"("_absence_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."delete_therapist_absence"("_absence_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."detect_bundles_for_auth_customer"("_hotel_id" "text", "_treatment_ids" "uuid"[]) TO "anon";

GRANT ALL ON FUNCTION "public"."detect_bundles_for_auth_customer"("_hotel_id" "text", "_treatment_ids" "uuid"[]) TO "authenticated";

GRANT ALL ON FUNCTION "public"."detect_bundles_for_auth_customer"("_hotel_id" "text", "_treatment_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."detect_bundles_for_booking"("_phone" "text", "_hotel_id" "text", "_treatment_ids" "uuid"[]) TO "authenticated";

GRANT ALL ON FUNCTION "public"."detect_bundles_for_booking"("_phone" "text", "_hotel_id" "text", "_treatment_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."detect_gift_cards_for_booking"("_phone" "text", "_hotel_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."detect_gift_cards_for_booking"("_phone" "text", "_hotel_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."expire_overdue_bundles"() TO "anon";

GRANT ALL ON FUNCTION "public"."expire_overdue_bundles"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."expire_overdue_bundles"() TO "service_role";

GRANT ALL ON FUNCTION "public"."find_or_create_customer"("_phone" "text", "_first_name" "text", "_last_name" "text", "_email" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."find_or_create_customer"("_phone" "text", "_first_name" "text", "_last_name" "text", "_email" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."find_or_create_customer"("_phone" "text", "_first_name" "text", "_last_name" "text", "_email" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_gift_redemption_code"() TO "anon";

GRANT ALL ON FUNCTION "public"."generate_gift_redemption_code"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_gift_redemption_code"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_unique_hotel_slug"("_base" "text", "_exclude_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."generate_unique_hotel_slug"("_base" "text", "_exclude_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_unique_hotel_slug"("_base" "text", "_exclude_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_unique_treatment_slug"("_hotel_id" "text", "_base" "text", "_exclude_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."generate_unique_treatment_slug"("_hotel_id" "text", "_base" "text", "_exclude_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_unique_treatment_slug"("_hotel_id" "text", "_base" "text", "_exclude_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "anon";

GRANT ALL ON FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_amenity_slot_occupancy"("p_venue_amenity_id" "uuid", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_booking_by_signature_token"("p_token" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_booking_by_signature_token"("p_token" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_booking_by_signature_token"("p_token" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_booking_summary"("_booking_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_booking_summary"("_booking_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "anon";

GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_customer_portal_data"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_customer_portal_data"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_customer_portal_data"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_enterprise_session_data"("_hotel_id" "text", "_session_date" "date") TO "anon";

GRANT ALL ON FUNCTION "public"."get_enterprise_session_data"("_hotel_id" "text", "_session_date" "date") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_enterprise_session_data"("_hotel_id" "text", "_session_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "anon";

GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_hotel"("_identifier" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_hotel"("_identifier" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_hotel"("_identifier" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_therapists"("_hotel_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_therapists"("_hotel_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_therapists"("_hotel_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_treatment_addons"("_parent_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_treatment_addons"("_parent_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_treatment_addons"("_parent_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_room_next_booking_gap"("_room_id" "uuid", "_booking_date" "date", "_booking_end_time" time without time zone, "_current_booking_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_room_next_booking_gap"("_room_id" "uuid", "_booking_date" "date", "_booking_end_time" time without time zone, "_current_booking_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_room_next_booking_gap"("_room_id" "uuid", "_booking_date" "date", "_booking_end_time" time without time zone, "_current_booking_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "anon";

GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_sessions_by_hotel"("_start_date" "date", "_end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_therapist_id"("_user_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_therapist_id"("_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_therapist_id"("_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_timezone"("_user_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_timezone"("_user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_timezone"("_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_venue_available_dates"("_hotel_id" "text", "_start_date" "text", "_end_date" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_venue_available_dates"("_hotel_id" "text", "_start_date" "text", "_end_date" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_venue_available_dates"("_hotel_id" "text", "_start_date" "text", "_end_date" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";

GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";

GRANT ALL ON FUNCTION "public"."hotels_autofill_slug"() TO "anon";

GRANT ALL ON FUNCTION "public"."hotels_autofill_slug"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."hotels_autofill_slug"() TO "service_role";

GRANT ALL ON FUNCTION "public"."is_booking_participant"("_booking_id" "uuid", "_therapist_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_booking_participant"("_booking_id" "uuid", "_therapist_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_booking_participant"("_booking_id" "uuid", "_therapist_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "anon";

GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."log_booking_change"() TO "anon";

GRANT ALL ON FUNCTION "public"."log_booking_change"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."log_booking_change"() TO "service_role";

GRANT ALL ON FUNCTION "public"."log_therapist_availability_change"() TO "anon";

GRANT ALL ON FUNCTION "public"."log_therapist_availability_change"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."log_therapist_availability_change"() TO "service_role";

GRANT ALL ON FUNCTION "public"."lookup_gift_card_by_code"("_code" "text", "_attempt_key" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."lookup_gift_card_by_code"("_code" "text", "_attempt_key" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."lookup_gift_card_by_code"("_code" "text", "_attempt_key" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."merge_customer_profiles"("_new_customer_id" "uuid", "_existing_customer_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."merge_customer_profiles"("_new_customer_id" "uuid", "_existing_customer_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."merge_customer_profiles"("_new_customer_id" "uuid", "_existing_customer_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."next_invoice_number"() TO "anon";

GRANT ALL ON FUNCTION "public"."next_invoice_number"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."next_invoice_number"() TO "service_role";

GRANT ALL ON FUNCTION "public"."notify_admins_on_completion_request"() TO "anon";

GRANT ALL ON FUNCTION "public"."notify_admins_on_completion_request"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."notify_admins_on_completion_request"() TO "service_role";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_assignment"() TO "anon";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_assignment"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_assignment"() TO "service_role";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_cancellation"() TO "anon";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_cancellation"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."notify_hairdresser_on_cancellation"() TO "service_role";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_new_booking"() TO "anon";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_new_booking"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_new_booking"() TO "service_role";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_on_unassignment"() TO "anon";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_on_unassignment"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."notify_hairdressers_on_unassignment"() TO "service_role";

GRANT ALL ON FUNCTION "public"."reactivate_prereservation"("_booking_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."reactivate_prereservation"("_booking_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."reactivate_prereservation"("_booking_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text", "_guest_count" integer, "_amenity_timing" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text", "_guest_count" integer, "_amenity_timing" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text", "_guest_count" integer, "_amenity_timing" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_ticket_closed_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."set_ticket_closed_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."set_ticket_closed_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."slugify"("_input" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."slugify"("_input" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."slugify"("_input" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_form_data" "jsonb") TO "anon";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_form_data" "jsonb") TO "authenticated";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_form_data" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_room_number" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_room_number" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."submit_client_signature"("p_token" "text", "p_signature" "text", "p_room_number" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "anon";

GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "service_role";

GRANT ALL ON FUNCTION "public"."treatment_menus_autofill_slug"() TO "anon";

GRANT ALL ON FUNCTION "public"."treatment_menus_autofill_slug"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."treatment_menus_autofill_slug"() TO "service_role";

GRANT ALL ON FUNCTION "public"."trigger_cancellation_notifications"() TO "anon";

GRANT ALL ON FUNCTION "public"."trigger_cancellation_notifications"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."trigger_cancellation_notifications"() TO "service_role";

GRANT ALL ON FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."update_treatment_categories_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_treatment_categories_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_treatment_categories_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."use_bundle_session"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_treatment_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."use_gift_amount"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_amount_cents" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."use_gift_amount"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_amount_cents" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."use_gift_amount"("_customer_bundle_id" "uuid", "_booking_id" "uuid", "_amount_cents" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "service_role";
