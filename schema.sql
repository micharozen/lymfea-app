


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'moderator',
    'user',
    'concierge',
    'therapist'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."schedule_type" AS ENUM (
    'always_open',
    'specific_days',
    'one_time'
);


ALTER TYPE "public"."schedule_type" OWNER TO "postgres";


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
    _new_status := 'awaiting_hairdresser_selection';
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
  _affected INT := 0;
BEGIN
  _start_date := make_date(_year, _month, 1);
  _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::date;
  _current_date := _start_date;

  WHILE _current_date <= _end_date LOOP
    _day_of_week := EXTRACT(ISODOW FROM _current_date)::int - 1;
    _day_config := _weekly_pattern->_day_of_week;

    INSERT INTO therapist_availability (therapist_id, date, is_available, shifts, is_manually_edited, last_change_source)
    VALUES (
      _therapist_id,
      _current_date,
      COALESCE((_day_config->>'enabled')::boolean, false),
      COALESCE(_day_config->'shifts', '[]'::jsonb),
      false,
      'template_apply'
    )
    ON CONFLICT (therapist_id, date) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      shifts = EXCLUDED.shifts,
      is_manually_edited = false,
      last_change_source = 'template_apply',
      updated_at = now()
    WHERE _overwrite_manual OR NOT therapist_availability.is_manually_edited;

    IF FOUND THEN
      _affected := _affected + 1;
    END IF;

    _current_date := _current_date + 1;
  END LOOP;

  RETURN _affected;
END;
$$;


ALTER FUNCTION "public"."apply_schedule_template"("_therapist_id" "uuid", "_year" integer, "_month" integer, "_weekly_pattern" "jsonb", "_overwrite_manual" boolean) OWNER TO "postgres";


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
  -- 1. Résoudre l'identité du thérapeute connecté
  SELECT id INTO _therapist_id
  FROM public.therapists
  WHERE user_id = auth.uid();

  IF _therapist_id IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : profil thérapeute introuvable pour cet utilisateur';
  END IF;

  -- 2. Vérifier que la réservation existe et est bien en statut "pending"
  --    (un thérapeute ne doit pas pouvoir refuser une résa déjà confirmée ou annulée)
  SELECT hotel_id INTO _booking_hotel_id
  FROM public.bookings
  WHERE id = _booking_id
    AND status = 'pending'
    AND therapist_id IS NULL;

  IF _booking_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà assignée ou non en attente';
  END IF;

  -- 3. Vérifier que le thérapeute est bien affilié à l'hôtel de la réservation
  --    (empêche un thérapeute d'un autre hôtel d'appeler le RPC directement)
  SELECT EXISTS(
    SELECT 1 FROM public.therapist_venues
    WHERE therapist_id = _therapist_id
      AND hotel_id = _booking_hotel_id
  ) INTO _is_affiliated;

  IF NOT _is_affiliated THEN
    RAISE EXCEPTION 'Accès refusé : ce thérapeute n''est pas affilié à l''hôtel de cette réservation';
  END IF;

  -- 4. Ajouter le thérapeute à declined_by de façon idempotente
  --    (array_append uniquement s'il n'y est pas déjà — évite les doublons)
  UPDATE public.bookings
  SET declined_by = array_append(COALESCE(declined_by, ARRAY[]::uuid[]), _therapist_id)
  WHERE id = _booking_id
    AND NOT (COALESCE(declined_by, ARRAY[]::uuid[]) @> ARRAY[_therapist_id]);

  -- Note : si le thérapeute était déjà dans declined_by, UPDATE affecte 0 lignes — comportement attendu.
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


CREATE OR REPLACE FUNCTION "public"."get_public_therapists"("_hotel_id" "text") RETURNS TABLE("id" "text", "first_name" "text", "profile_image" "text", "skills" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.id, t.first_name, t.profile_image, t.skills
  FROM public.therapists t
  INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
  WHERE tv.hotel_id = _hotel_id AND t.status IN ('Active', 'Actif', 'active')
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


CREATE OR REPLACE FUNCTION "public"."get_public_treatments"("_hotel_id" "text") RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "name_en" "text", "description" "text", "description_en" "text", "category" "text", "service_for" "text", "duration" integer, "price" numeric, "price_on_request" boolean, "lead_time" integer, "image" "text", "sort_order" integer, "currency" "text", "is_bestseller" boolean, "is_addon" boolean, "is_bundle" boolean, "bundle_id" "uuid", "available_days" integer[], "variants" "jsonb")
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
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
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
      AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
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


CREATE OR REPLACE FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text" DEFAULT NULL::"text", "_therapist_gender" "text" DEFAULT NULL::"text", "_stripe_session_id" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _room_id UUID;
  _booking_id UUID;
  _room RECORD;
  _new_start INTEGER;
  _new_end INTEGER;
  _has_conflict BOOLEAN;
  _required_specialties TEXT[];
  _therapist_id UUID;
  _therapist_skills TEXT[];
  _travel_buffer INTEGER;
  _turnover_buffer INTEGER;
  _requested_dow INTEGER;
  _treatment_record RECORD;
BEGIN
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id := NULLIF(NULLIF(NULLIF(_customer_id, 'undefined'), 'null'), '');

  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  SELECT COALESCE(inter_venue_buffer_minutes, 0),
         COALESCE(room_turnover_buffer_minutes, 0)
  INTO _travel_buffer, _turnover_buffer
  FROM hotels WHERE id::text = _hotel_id;

  _requested_dow := EXTRACT(DOW FROM _booking_date)::integer;

  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    FOR _treatment_record IN
      SELECT name, available_days
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
    LOOP
      IF _treatment_record.available_days IS NOT NULL
         AND array_length(_treatment_record.available_days, 1) > 0
         AND NOT _requested_dow = ANY(_treatment_record.available_days)
      THEN
        RAISE EXCEPTION 'DAY_CONSTRAINT_VIOLATION: Le soin "%" n''est pas disponible ce jour-là.', _treatment_record.name;
      END IF;
    END LOOP;
  END IF;

  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND treatment_type IS NOT NULL
      AND treatment_type != '';
  END IF;

  <<room_loop>>
  FOR _room IN
    SELECT id, room_number FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id
        AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30) + _turnover_buffer
             AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN CONTINUE room_loop; END IF;

    -- Recherche d'au moins un thérapeute qualifié/disponible (validation uniquement ; pas d'assignation)
    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND _room.id::text = ANY(string_to_array(t.trunks, ', '))
        AND (_therapist_gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
          IF NOT _required_specialties <@ _therapist_skills THEN
            CONTINUE;
          END IF;
        END IF;
      END IF;

      SELECT EXISTS(
        SELECT 1 FROM bookings b
        LEFT JOIN hotels h ON h.id = b.hotel_id
        WHERE b.therapist_id = _therapist_id
          AND b.booking_date = _booking_date
          AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '4 minutes')
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
        _room_id := _room.id;
        EXIT room_loop;
      END IF;
    END LOOP;
  END LOOP;

  IF _room_id IS NULL THEN RAISE EXCEPTION 'NO_TRUNK_AVAILABLE'; END IF;

  -- Insertion finale : therapist_id = NULL (broadcast aux thérapeutes qualifiés)
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, therapist_id, total_price, duration,
    room_number, customer_id, payment_method, payment_status, language
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, NULL, _total_price, _duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;


ALTER FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text") OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "profile_image" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "welcome_seen_at" timestamp with time zone
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amenity_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "venue_amenity_id" "uuid" NOT NULL,
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "duration" integer NOT NULL,
    "end_time" time without time zone NOT NULL,
    "customer_id" "uuid",
    "client_type" "text" NOT NULL,
    "room_number" "text",
    "linked_booking_id" "uuid",
    "num_guests" integer DEFAULT 1 NOT NULL,
    "price" numeric(10,2) DEFAULT 0,
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "amenity_bookings_client_type_check" CHECK (("client_type" = ANY (ARRAY['external'::"text", 'internal'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "amenity_bookings_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'noshow'::"text"])))
);


ALTER TABLE "public"."amenity_bookings" OWNER TO "postgres";


COMMENT ON TABLE "public"."amenity_bookings" IS 'Capacity-based amenity reservations (pool, fitness, etc.)';



COMMENT ON COLUMN "public"."amenity_bookings"."end_time" IS 'Pre-computed end time for efficient overlap queries';



COMMENT ON COLUMN "public"."amenity_bookings"."client_type" IS 'external = paying guest, internal = hotel guest (free), lymfea = treatment client';



COMMENT ON COLUMN "public"."amenity_bookings"."linked_booking_id" IS 'For lymfea clients: reference to the treatment booking that includes amenity access';



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_type" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_flagged" boolean DEFAULT false NOT NULL,
    "flag_type" "text",
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "uuid",
    CONSTRAINT "audit_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'action'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_type" "text" NOT NULL,
    "owner_id" "text" NOT NULL,
    "company_name" "text",
    "legal_form" "text",
    "siret" "text",
    "siren" "text",
    "tva_number" "text",
    "vat_exempt" boolean DEFAULT false NOT NULL,
    "billing_address" "text",
    "billing_postal_code" "text",
    "billing_city" "text",
    "billing_country" "text" DEFAULT 'France'::"text",
    "contact_email" "text",
    "contact_phone" "text",
    "iban" "text",
    "bic" "text",
    "bank_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_profiles_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text"])))
);


ALTER TABLE "public"."billing_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."billing_profiles" IS 'Polymorphic billing info for therapists and hotels (used for invoice generation)';



COMMENT ON COLUMN "public"."billing_profiles"."owner_type" IS 'Target entity type: therapist or hotel';



COMMENT ON COLUMN "public"."billing_profiles"."owner_id" IS 'Logical FK to therapists.id or hotels.id (resolved by owner_type)';



COMMENT ON COLUMN "public"."billing_profiles"."vat_exempt" IS 'VAT exemption (art. 293 B du CGI) — typically auto-entrepreneurs';



CREATE TABLE IF NOT EXISTS "public"."booking_alternative_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "hairdresser_id" "uuid" NOT NULL,
    "original_date" "date" NOT NULL,
    "original_time" time without time zone NOT NULL,
    "alternative_1_date" "date" NOT NULL,
    "alternative_1_time" time without time zone NOT NULL,
    "alternative_2_date" "date" NOT NULL,
    "alternative_2_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "current_offer_index" integer DEFAULT 1,
    "whatsapp_message_id" "text",
    "client_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "booking_alternative_proposals_current_offer_index_check" CHECK (("current_offer_index" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "booking_alternative_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'slot1_offered'::"text", 'slot1_accepted'::"text", 'slot1_rejected'::"text", 'slot2_offered'::"text", 'slot2_accepted'::"text", 'all_rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."booking_alternative_proposals" OWNER TO "postgres";


COMMENT ON TABLE "public"."booking_alternative_proposals" IS 'Tracks hairdresser-proposed alternative time slots for bookings when they cannot accept the original time';



COMMENT ON COLUMN "public"."booking_alternative_proposals"."status" IS 'Flow state: pending -> slot1_offered -> (slot1_accepted | slot1_rejected -> slot2_offered -> (slot2_accepted | all_rejected)) | expired';



COMMENT ON COLUMN "public"."booking_alternative_proposals"."current_offer_index" IS '1 = first alternative being offered, 2 = second alternative being offered';



CREATE TABLE IF NOT EXISTS "public"."booking_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_notes_content_check" CHECK (("char_length"("content") > 0))
);


ALTER TABLE "public"."booking_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_payment_infos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "customer_id" "uuid",
    "stripe_payment_method_id" "text",
    "stripe_setup_intent_id" "text",
    "stripe_session_id" "text",
    "card_brand" "text",
    "card_last4" "text",
    "estimated_price" numeric(10,2),
    "payment_status" "text" DEFAULT 'pending'::"text",
    "payment_at" timestamp with time zone,
    "stripe_payment_intent_id" "text",
    "payment_error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_link_stripe_id" "text",
    "payment_link_expires_at" timestamp with time zone,
    "payment_reminder_count" integer DEFAULT 0,
    "payment_last_reminder_at" timestamp with time zone,
    "cancellation_reason" "text",
    CONSTRAINT "booking_payment_infos_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'charged'::"text", 'failed'::"text", 'requires_action'::"text", 'card_saved'::"text"])))
);


ALTER TABLE "public"."booking_payment_infos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_proposed_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "slot_1_date" "date" NOT NULL,
    "slot_1_time" time without time zone NOT NULL,
    "slot_2_date" "date",
    "slot_2_time" time without time zone,
    "slot_3_date" "date",
    "slot_3_time" time without time zone,
    "validated_slot" integer,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval) NOT NULL,
    "admin_notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_proposed_slots_validated_slot_check" CHECK (("validated_slot" = ANY (ARRAY[1, 2, 3])))
);


ALTER TABLE "public"."booking_proposed_slots" OWNER TO "postgres";


COMMENT ON TABLE "public"."booking_proposed_slots" IS 'Stores up to 3 proposed time slots for concierge-created bookings. Hairdressers validate one slot before payment link is sent.';



COMMENT ON COLUMN "public"."booking_proposed_slots"."validated_slot" IS 'Which slot (1, 2, or 3) was validated by the hairdresser';



COMMENT ON COLUMN "public"."booking_proposed_slots"."expires_at" IS 'Auto-set to created_at + 2h. If no validation by then, admin is notified.';



CREATE TABLE IF NOT EXISTS "public"."booking_therapists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_at" timestamp with time zone
);


ALTER TABLE "public"."booking_therapists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variant_id" "uuid"
);


ALTER TABLE "public"."booking_treatments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bookings_booking_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bookings_booking_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "hotel_name" "text",
    "client_first_name" "text" NOT NULL,
    "client_last_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "room_number" "text",
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "therapist_id" "uuid",
    "therapist_name" "text",
    "total_price" numeric DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_id" integer DEFAULT "nextval"('"public"."bookings_booking_id_seq"'::"regclass") NOT NULL,
    "client_signature" "text",
    "cancellation_reason" "text",
    "signed_at" timestamp with time zone,
    "assigned_at" timestamp with time zone,
    "declined_by" "uuid"[] DEFAULT '{}'::"uuid"[],
    "client_email" "text",
    "payment_method" "text" DEFAULT 'room'::"text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "client_note" "text",
    "stripe_invoice_url" "text",
    "quote_token" "text",
    "room_id" "uuid",
    "duration" integer,
    "payment_link_url" "text",
    "payment_link_sent_at" timestamp with time zone,
    "payment_link_channels" "text"[],
    "payment_link_language" "text",
    "payment_error_code" "text",
    "payment_error_message" "text",
    "payment_error_details" "jsonb",
    "customer_id" "uuid",
    "pms_charge_status" "text",
    "pms_charge_id" "text",
    "pms_error_message" "text",
    "is_out_of_hours" boolean DEFAULT false,
    "surcharge_amount" numeric DEFAULT 0,
    "pms_guest_check_in" timestamp with time zone,
    "pms_guest_check_out" timestamp with time zone,
    "signature_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text"),
    "client_form_data" "jsonb",
    "language" "text" DEFAULT 'fr'::"text",
    "bundle_usage_id" "uuid",
    "gift_amount_applied_cents" integer DEFAULT 0 NOT NULL,
    "guest_count" integer DEFAULT 1 NOT NULL,
    "therapist_checked_in_at" timestamp with time zone,
    "hold_expires_at" timestamp with time zone,
    "client_type" "text" DEFAULT 'external'::"text" NOT NULL,
    "payment_reference" "text",
    CONSTRAINT "bookings_client_type_check" CHECK (("client_type" = ANY (ARRAY['hotel'::"text", 'staycation'::"text", 'classpass'::"text", 'external'::"text"]))),
    CONSTRAINT "bookings_gift_amount_applied_cents_check" CHECK (("gift_amount_applied_cents" >= 0)),
    CONSTRAINT "bookings_payment_link_language_check" CHECK (("payment_link_language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "bookings_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['room'::"text", 'card'::"text", 'tap_to_pay'::"text", 'offert'::"text", 'gift_amount'::"text", 'voucher'::"text", 'partner_billed'::"text"]))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'awaiting_payment'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'charged'::"text", 'charged_to_room'::"text", 'card_saved'::"text", 'expired'::"text", 'pending_partner_billing'::"text", 'pending_room_charge'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."status" IS 'Valid values: pending, confirmed, ongoing, completed, cancelled, noshow';



COMMENT ON COLUMN "public"."bookings"."declined_by" IS 'Array of hairdresser IDs who have declined or unassigned from this booking';



COMMENT ON COLUMN "public"."bookings"."payment_link_url" IS 'Stripe Payment Link URL sent to client';



COMMENT ON COLUMN "public"."bookings"."payment_link_sent_at" IS 'Timestamp when payment link was sent';



COMMENT ON COLUMN "public"."bookings"."payment_link_channels" IS 'Channels used to send link: email, whatsapp';



COMMENT ON COLUMN "public"."bookings"."payment_link_language" IS 'Language of the payment link message: fr or en';



COMMENT ON COLUMN "public"."bookings"."payment_error_code" IS 'Code d''erreur Stripe (card_declined, insufficient_funds, expired_card, etc.)';



COMMENT ON COLUMN "public"."bookings"."payment_error_message" IS 'Message d''erreur lisible par humain pour affichage dans l''UI';



COMMENT ON COLUMN "public"."bookings"."payment_error_details" IS 'Détails JSON de l''erreur: decline_code, network_decline_code, last4, brand, timestamp';



COMMENT ON COLUMN "public"."bookings"."customer_id" IS 'Reference to persistent customer profile. Denormalized client_* fields kept for backward compat.';



COMMENT ON COLUMN "public"."bookings"."bundle_usage_id" IS 'Reference to bundle session usage if this booking consumed a cure credit';



COMMENT ON COLUMN "public"."bookings"."gift_amount_applied_cents" IS 'Portion of the booking price paid via a gift_amount card redemption';



CREATE TABLE IF NOT EXISTS "public"."bundle_amount_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_bundle_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount_cents_used" integer NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bundle_amount_usages_amount_cents_used_check" CHECK (("amount_cents_used" > 0))
);


ALTER TABLE "public"."bundle_amount_usages" OWNER TO "postgres";


COMMENT ON TABLE "public"."bundle_amount_usages" IS 'Audit trail for each redemption of a gift_amount bundle on a booking';



CREATE TABLE IF NOT EXISTS "public"."bundle_session_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_bundle_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bundle_session_usages" OWNER TO "postgres";


COMMENT ON TABLE "public"."bundle_session_usages" IS 'Tracks each session usage: which booking consumed a bundle credit';



CREATE TABLE IF NOT EXISTS "public"."client_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "page_path" "text",
    "referrer" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "user_agent" "text",
    "device_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "client_analytics_device_type_check" CHECK (("device_type" = ANY (ARRAY['mobile'::"text", 'tablet'::"text", 'desktop'::"text", 'unknown'::"text"]))),
    CONSTRAINT "client_analytics_event_type_check" CHECK (("event_type" = ANY (ARRAY['page_view'::"text", 'action'::"text", 'conversion'::"text"])))
);


ALTER TABLE "public"."client_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."concierge_hotels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "concierge_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."concierge_hotels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."concierges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "hotel_id" "text",
    "profile_image" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "venue_role" "text",
    "welcome_seen_at" timestamp with time zone
);


ALTER TABLE "public"."concierges" OWNER TO "postgres";


COMMENT ON COLUMN "public"."concierges"."must_change_password" IS 'Flag to force password change on first login';



CREATE TABLE IF NOT EXISTS "public"."customer_treatment_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "total_sessions" integer,
    "used_sessions" integer DEFAULT 0 NOT NULL,
    "purchase_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expires_at" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "sold_by" "uuid",
    "payment_reference" "text",
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "beneficiary_customer_id" "uuid",
    "total_amount_cents" integer,
    "used_amount_cents" integer DEFAULT 0 NOT NULL,
    "is_gift" boolean DEFAULT false NOT NULL,
    "gift_delivery_mode" "text",
    "sender_name" "text",
    "sender_email" "text",
    "recipient_name" "text",
    "recipient_email" "text",
    "gift_message" "text",
    "redemption_code" "text",
    "delivered_at" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    CONSTRAINT "chk_ctb_gift_shape" CHECK (((("is_gift" = false) AND ("gift_delivery_mode" IS NULL)) OR (("is_gift" = true) AND ("redemption_code" IS NOT NULL) AND ("gift_delivery_mode" IS NOT NULL)))),
    CONSTRAINT "chk_ctb_used_le_total_amount" CHECK ((("total_amount_cents" IS NULL) OR ("used_amount_cents" <= "total_amount_cents"))),
    CONSTRAINT "chk_ctb_used_le_total_sessions" CHECK ((("total_sessions" IS NULL) OR ("used_sessions" <= "total_sessions"))),
    CONSTRAINT "customer_treatment_bundles_gift_delivery_mode_check" CHECK ((("gift_delivery_mode" IS NULL) OR ("gift_delivery_mode" = ANY (ARRAY['email'::"text", 'print'::"text"])))),
    CONSTRAINT "customer_treatment_bundles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "customer_treatment_bundles_total_amount_cents_check" CHECK ((("total_amount_cents" IS NULL) OR ("total_amount_cents" > 0))),
    CONSTRAINT "customer_treatment_bundles_used_amount_cents_check" CHECK (("used_amount_cents" >= 0)),
    CONSTRAINT "customer_treatment_bundles_used_sessions_check" CHECK (("used_sessions" >= 0))
);


ALTER TABLE "public"."customer_treatment_bundles" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_treatment_bundles" IS 'Sold bundles: tracks sessions used/remaining per customer';



COMMENT ON COLUMN "public"."customer_treatment_bundles"."sold_by" IS 'UUID of the admin/concierge who sold it manually (NULL if purchased online)';



COMMENT ON COLUMN "public"."customer_treatment_bundles"."booking_id" IS 'Reference to the purchase booking (client bought the cure as a treatment)';



COMMENT ON COLUMN "public"."customer_treatment_bundles"."beneficiary_customer_id" IS 'Customer who can consume this bundle. Same as customer_id for cures and self-purchased gifts. NULL for gifts awaiting claim.';



COMMENT ON COLUMN "public"."customer_treatment_bundles"."redemption_code" IS 'Public 10-char code used by the beneficiary to claim the gift at /portal/redeem';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text",
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "preferred_therapist_id" "uuid",
    "preferred_treatment_type" "text",
    "health_notes" "text",
    "language" "text" DEFAULT 'fr'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text",
    "auth_user_id" "uuid",
    "profile_completed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "customers_language_check" CHECK (("language" = ANY (ARRAY['fr'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."customers" IS 'Persistent customer profiles with treatment history and preferences';



COMMENT ON COLUMN "public"."customers"."health_notes" IS 'Health notes, allergies, contraindications for spa treatments';



COMMENT ON COLUMN "public"."customers"."language" IS 'Preferred language for communications (fr or en)';



COMMENT ON COLUMN "public"."customers"."auth_user_id" IS 'Supabase Auth user linked to this customer profile (client portal). Unique when not NULL.';



COMMENT ON COLUMN "public"."customers"."profile_completed" IS 'False during portal onboarding until first_name + phone have been supplied by the customer.';



CREATE TABLE IF NOT EXISTS "public"."gift_code_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attempt_key" "text" NOT NULL,
    "succeeded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gift_code_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."gift_code_attempts" IS 'Audit of lookup_gift_card_by_code calls for brute-force rate limiting. attempt_key = IP or session identifier.';



CREATE TABLE IF NOT EXISTS "public"."hotel_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT 'a0000000-0000-0000-0000-000000000001'::"uuid",
    "hotel_id" "text" NOT NULL,
    "booking_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hotel_ledger_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'billed'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."hotel_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotel_pms_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "pms_type" "text" DEFAULT 'opera_cloud'::"text" NOT NULL,
    "gateway_url" "text",
    "client_id" "text",
    "client_secret" "text",
    "app_key" "text",
    "enterprise_id" "text",
    "pms_hotel_id" "text",
    "auto_charge_room" boolean DEFAULT false,
    "guest_lookup_enabled" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "access_token" "text",
    "service_id" "text",
    "accounting_category_id" "text",
    "api_url" "text",
    "connection_status" "text" DEFAULT 'unknown'::"text",
    "connection_verified_at" timestamp with time zone
);


ALTER TABLE "public"."hotel_pms_configs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hotel_pms_configs"."access_token" IS 'Mews: per-property AccessToken';



COMMENT ON COLUMN "public"."hotel_pms_configs"."service_id" IS 'Mews: Spa ServiceId for posting charges';



COMMENT ON COLUMN "public"."hotel_pms_configs"."accounting_category_id" IS 'Mews: accounting category for spa charges (optional)';



COMMENT ON COLUMN "public"."hotel_pms_configs"."api_url" IS 'API base URL (Mews: api.mews.com or api.mews-demo.com)';



COMMENT ON COLUMN "public"."hotel_pms_configs"."connection_status" IS 'Last test result: connected, failed, unknown';



COMMENT ON COLUMN "public"."hotel_pms_configs"."connection_verified_at" IS 'Timestamp of last successful connection test';



CREATE TABLE IF NOT EXISTS "public"."hotels" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "image" "text",
    "address" "text",
    "city" "text",
    "country" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_image" "text",
    "postal_code" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "vat" numeric(5,2) DEFAULT 20.00,
    "hotel_commission" numeric(5,2) DEFAULT 10.00,
    "therapist_commission" numeric(5,2) DEFAULT 70.00,
    "status" "text" DEFAULT 'active'::"text",
    "country_code" "text" DEFAULT 'FR'::"text",
    "timezone" "text" DEFAULT 'Europe/Paris'::"text",
    "venue_type" "text" DEFAULT 'hotel'::"text",
    "opening_time" time without time zone DEFAULT '06:00:00'::time without time zone,
    "closing_time" time without time zone DEFAULT '23:00:00'::time without time zone,
    "auto_validate_bookings" boolean DEFAULT false,
    "description" "text",
    "landing_subtitle" "text",
    "offert" boolean DEFAULT false,
    "slot_interval" integer DEFAULT 30,
    "company_offered" boolean DEFAULT false,
    "pms_type" "text",
    "pms_auto_charge_room" boolean DEFAULT false,
    "pms_guest_lookup_enabled" boolean DEFAULT false,
    "calendar_color" "text" DEFAULT '#3b82f6'::"text",
    "global_therapist_commission" boolean DEFAULT true,
    "allow_out_of_hours_booking" boolean DEFAULT false,
    "out_of_hours_surcharge_percent" numeric DEFAULT 0,
    "name_en" "text",
    "landing_subtitle_en" "text",
    "description_en" "text",
    "inter_venue_buffer_minutes" integer DEFAULT 0,
    "room_turnover_buffer_minutes" integer DEFAULT 0,
    "slug" "text" NOT NULL,
    "booking_hold_enabled" boolean DEFAULT true NOT NULL,
    "booking_hold_duration_minutes" integer DEFAULT 5 NOT NULL,
    "min_booking_notice_minutes" integer DEFAULT 0,
    CONSTRAINT "check_venue_hours" CHECK (("opening_time" < "closing_time")),
    CONSTRAINT "hotels_booking_hold_duration_range" CHECK ((("booking_hold_duration_minutes" >= 1) AND ("booking_hold_duration_minutes" <= 15))),
    CONSTRAINT "hotels_slug_pattern_check" CHECK ((("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text") AND (("length"("slug") >= 2) AND ("length"("slug") <= 60)))),
    CONSTRAINT "hotels_venue_type_check" CHECK (("venue_type" = ANY (ARRAY['hotel'::"text", 'spa'::"text"])))
);


ALTER TABLE "public"."hotels" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hotels"."opening_time" IS 'Venue opening time for bookings (24h format)';



COMMENT ON COLUMN "public"."hotels"."closing_time" IS 'Venue closing time for bookings (24h format)';



COMMENT ON COLUMN "public"."hotels"."auto_validate_bookings" IS 'When true and only 1 active hairdresser is assigned to the venue, bookings are automatically confirmed without manual hairdresser validation';



COMMENT ON COLUMN "public"."hotels"."min_booking_notice_minutes" IS 'Délai minimum (en minutes) entre maintenant et l''heure du créneau réservable. 0 = pas de délai.';



CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_kind" "text" NOT NULL,
    "issuer_type" "text" NOT NULL,
    "issuer_id" "text",
    "client_type" "text" NOT NULL,
    "client_id" "text",
    "therapist_id" "uuid",
    "hotel_id" "text",
    "invoice_number" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date" NOT NULL,
    "amount_ht" numeric(10,2) NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 20 NOT NULL,
    "vat_amount" numeric(10,2) NOT NULL,
    "amount_ttc" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "bookings_count" integer DEFAULT 0 NOT NULL,
    "html_snapshot" "text",
    "issuer_snapshot" "jsonb",
    "client_snapshot" "jsonb",
    "metadata" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_client_type_check" CHECK (("client_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "invoices_invoice_kind_check" CHECK (("invoice_kind" = ANY (ARRAY['therapist_commission'::"text", 'hotel_commission'::"text"]))),
    CONSTRAINT "invoices_issuer_type_check" CHECK (("issuer_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoices" IS 'Generic invoice table supporting multiple kinds (therapist commission, hotel commission)';



COMMENT ON COLUMN "public"."invoices"."invoice_kind" IS 'therapist_commission (Lymfea→therapist) | hotel_commission (Lymfea→hotel)';



COMMENT ON COLUMN "public"."invoices"."html_snapshot" IS 'Frozen HTML document generated at creation time';



COMMENT ON COLUMN "public"."invoices"."issuer_snapshot" IS 'Frozen copy of issuer billing profile at generation time';



COMMENT ON COLUMN "public"."invoices"."client_snapshot" IS 'Frozen copy of client billing profile at generation time';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_number" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "first_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."otp_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/Paris'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text",
    CONSTRAINT "profiles_language_check" CHECK ((("language" IS NULL) OR ("language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_notification_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapist_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "therapist_absences_reason_check" CHECK (("reason" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'other'::"text"]))),
    CONSTRAINT "valid_date_range" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."therapist_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapist_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "shifts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_manually_edited" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_change_source" "text" DEFAULT 'unknown'::"text" NOT NULL
);


ALTER TABLE "public"."therapist_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapist_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT 'a0000000-0000-0000-0000-000000000001'::"uuid",
    "therapist_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "stripe_transfer_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hairdresser_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."therapist_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapist_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "rating_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    CONSTRAINT "hairdresser_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."therapist_ratings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."therapist_ratings"."submitted_at" IS 'Timestamp when client finalized their rating - prevents subsequent updates';



CREATE TABLE IF NOT EXISTS "public"."therapist_schedule_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "weekly_pattern" "jsonb" DEFAULT '[{"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."therapist_schedule_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapist_venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."therapist_venues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."therapists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "phone" "text" NOT NULL,
    "profile_image" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "trunks" "text",
    "skills" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "stripe_account_id" "text",
    "password_set" boolean DEFAULT false,
    "stripe_onboarding_completed" boolean DEFAULT false,
    "minimum_guarantee" "jsonb" DEFAULT '{}'::"jsonb",
    "minimum_guarantee_active" boolean DEFAULT false,
    "hourly_rate" numeric(8,2) DEFAULT NULL::numeric,
    "rate_45" numeric,
    "rate_60" numeric,
    "rate_90" numeric,
    "gender" "text",
    CONSTRAINT "therapists_gender_check" CHECK (("gender" = ANY (ARRAY['female'::"text", 'male'::"text"])))
);


ALTER TABLE "public"."therapists" OWNER TO "postgres";


COMMENT ON COLUMN "public"."therapists"."rate_45" IS 'Fixed therapist payout for a 45-minute treatment';



COMMENT ON COLUMN "public"."therapists"."rate_60" IS 'Fixed therapist payout for a 60-minute treatment';



COMMENT ON COLUMN "public"."therapists"."rate_90" IS 'Fixed therapist payout for a 90-minute treatment';



CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "creator_name" "text",
    "creator_role" "text",
    "notion_page_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "screenshot_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "tickets_category_check" CHECK (("category" = ANY (ARRAY['question'::"text", 'billing'::"text", 'booking'::"text", 'problem'::"text", 'other'::"text"]))),
    CONSTRAINT "tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_addons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_treatment_id" "uuid" NOT NULL,
    "addon_treatment_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_addons_no_self" CHECK (("parent_treatment_id" <> "addon_treatment_id"))
);


ALTER TABLE "public"."treatment_addons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_bundle_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL
);


ALTER TABLE "public"."treatment_bundle_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."treatment_bundle_items" IS 'Junction table: which treatments are eligible for a given bundle';



CREATE TABLE IF NOT EXISTS "public"."treatment_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "description_en" "text",
    "total_sessions" integer,
    "price" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "validity_days" integer DEFAULT 365,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bundle_type" "text" DEFAULT 'cure'::"text" NOT NULL,
    "amount_cents" integer,
    "title" "text",
    "title_en" "text",
    "cover_image_url" "text",
    "display_on_client_flow" boolean DEFAULT true NOT NULL,
    CONSTRAINT "chk_bundle_amount_shape" CHECK (((("bundle_type" = 'gift_amount'::"text") AND ("amount_cents" IS NOT NULL)) OR (("bundle_type" <> 'gift_amount'::"text") AND ("amount_cents" IS NULL)))),
    CONSTRAINT "chk_bundle_sessions_shape" CHECK (((("bundle_type" = ANY (ARRAY['cure'::"text", 'gift_treatments'::"text"])) AND ("total_sessions" IS NOT NULL) AND ("total_sessions" > 0)) OR (("bundle_type" = 'gift_amount'::"text") AND ("total_sessions" IS NULL)))),
    CONSTRAINT "treatment_bundles_amount_cents_check" CHECK ((("amount_cents" IS NULL) OR ("amount_cents" > 0))),
    CONSTRAINT "treatment_bundles_bundle_type_check" CHECK (("bundle_type" = ANY (ARRAY['cure'::"text", 'gift_treatments'::"text", 'gift_amount'::"text"]))),
    CONSTRAINT "treatment_bundles_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "treatment_bundles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."treatment_bundles" OWNER TO "postgres";


COMMENT ON TABLE "public"."treatment_bundles" IS 'Bundle/cure templates: N sessions of eligible treatments sold as a package';



COMMENT ON COLUMN "public"."treatment_bundles"."bundle_type" IS 'cure = multi-session package, gift_treatments = gift card for N sessions, gift_amount = gift card for a monetary amount';



COMMENT ON COLUMN "public"."treatment_bundles"."amount_cents" IS 'Monetary value for gift_amount bundles (in cents). Required iff bundle_type = gift_amount';



COMMENT ON COLUMN "public"."treatment_bundles"."title" IS 'Marketing title for gift cards (displayed on the card visual and email)';



COMMENT ON COLUMN "public"."treatment_bundles"."cover_image_url" IS 'Visual image for the gift card (shown in client flow and embedded in the email)';



CREATE TABLE IF NOT EXISTS "public"."treatment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name_en" "text",
    "is_addon" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."treatment_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration" integer,
    "price" numeric(10,2) DEFAULT 0.00,
    "lead_time" integer,
    "service_for" "text" NOT NULL,
    "category" "text" NOT NULL,
    "hotel_id" "text",
    "image" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0,
    "price_on_request" boolean DEFAULT false,
    "currency" "text" DEFAULT 'EUR'::"text",
    "is_bestseller" boolean DEFAULT false,
    "requires_room" boolean DEFAULT false,
    "treatment_type" "text",
    "name_en" "text",
    "description_en" "text",
    "is_bundle" boolean DEFAULT false,
    "bundle_id" "uuid",
    "is_addon" boolean DEFAULT false NOT NULL,
    "slug" "text" NOT NULL,
    "available_days" integer[],
    CONSTRAINT "treatment_menus_slug_pattern_check" CHECK ((("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text") AND (("length"("slug") >= 2) AND ("length"("slug") <= 60))))
);


ALTER TABLE "public"."treatment_menus" OWNER TO "postgres";


COMMENT ON COLUMN "public"."treatment_menus"."requires_room" IS 'Whether this treatment requires a dedicated treatment room/cabin';



COMMENT ON COLUMN "public"."treatment_menus"."treatment_type" IS 'Treatment category: body, face, wellness, etc.';



COMMENT ON COLUMN "public"."treatment_menus"."is_bundle" IS 'True if this treatment represents a bundle/cure purchase in the client flow';



COMMENT ON COLUMN "public"."treatment_menus"."bundle_id" IS 'Reference to the bundle template this treatment represents';



COMMENT ON COLUMN "public"."treatment_menus"."available_days" IS 'Jours autorisés : 0=Dim, 1=Lun, ..., 6=Sam. NULL = disponible tous les jours.';



CREATE TABLE IF NOT EXISTS "public"."treatment_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "room_type" "text" NOT NULL,
    "room_number" "text" NOT NULL,
    "image" "text",
    "hotel_id" "text",
    "hotel_name" "text",
    "next_booking" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "capacity" integer DEFAULT 1,
    "capabilities" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."treatment_rooms" OWNER TO "postgres";


COMMENT ON COLUMN "public"."treatment_rooms"."capabilities" IS 'Array of treatment types this room supports (e.g. Massage, Facial, Hammam). Replaces the single room_type field.';



CREATE TABLE IF NOT EXISTS "public"."treatment_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "label" "text",
    "duration" integer NOT NULL,
    "price" numeric(10,2),
    "price_on_request" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "is_default" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "label_en" "text",
    "guest_count" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "treatment_variants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."treatment_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venue_amenities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "name" "text",
    "color" "text" DEFAULT '#3b82f6'::"text" NOT NULL,
    "capacity_per_slot" integer DEFAULT 10 NOT NULL,
    "slot_duration" integer DEFAULT 60 NOT NULL,
    "prep_time" integer DEFAULT 0 NOT NULL,
    "price_external" numeric(10,2) DEFAULT 0,
    "price_lymfea" numeric(10,2) DEFAULT 0,
    "lymfea_access_included" boolean DEFAULT true NOT NULL,
    "lymfea_access_duration" integer DEFAULT 60,
    "currency" "text" DEFAULT 'EUR'::"text",
    "opening_time" time without time zone,
    "closing_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."venue_amenities" OWNER TO "postgres";


COMMENT ON TABLE "public"."venue_amenities" IS 'Per-venue amenity configuration (pool, fitness, sauna, etc.)';



COMMENT ON COLUMN "public"."venue_amenities"."type" IS 'Amenity type key matching frontend AMENITY_TYPES constant';



COMMENT ON COLUMN "public"."venue_amenities"."prep_time" IS 'Cleaning/prep time in minutes between bookings for privatized amenities';



COMMENT ON COLUMN "public"."venue_amenities"."lymfea_access_included" IS 'Whether spa treatment clients get free amenity access';



COMMENT ON COLUMN "public"."venue_amenities"."lymfea_access_duration" IS 'Duration in minutes of complimentary access for treatment clients';



CREATE TABLE IF NOT EXISTS "public"."venue_blocked_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" integer[],
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_slot_time_order" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."venue_blocked_slots" OWNER TO "postgres";


COMMENT ON TABLE "public"."venue_blocked_slots" IS 'Defines time ranges when a venue cannot accept bookings (e.g., lunch breaks). Slots falling within these ranges are filtered out of check-availability results.';



COMMENT ON COLUMN "public"."venue_blocked_slots"."label" IS 'Human-readable label for the block, shown in admin UI (e.g., "Pause déjeuner").';



COMMENT ON COLUMN "public"."venue_blocked_slots"."days_of_week" IS 'Days when this block applies. NULL means all days. Uses PostgreSQL DOW convention: 0=Sunday, 1=Monday, ..., 6=Saturday.';



CREATE TABLE IF NOT EXISTS "public"."venue_deployment_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "schedule_type" "public"."schedule_type" DEFAULT 'always_open'::"public"."schedule_type" NOT NULL,
    "days_of_week" integer[],
    "recurring_start_date" "date",
    "recurring_end_date" "date",
    "specific_dates" "date"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "recurrence_interval" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "recurrence_interval_positive" CHECK (("recurrence_interval" >= 1))
);


ALTER TABLE "public"."venue_deployment_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."venue_deployment_schedules"."recurrence_interval" IS 'Number of weeks between recurrences. 1 = every week, 2 = every other week, etc. Only applies when schedule_type = specific_days';



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_owner_type_owner_id_key" UNIQUE ("owner_type", "owner_id");



ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_booking_id_therapist_id_key" UNIQUE ("booking_id", "therapist_id");



ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_signature_token_key" UNIQUE ("signature_token");



ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_booking_id_customer_bundle_id_key" UNIQUE ("booking_id", "customer_bundle_id");



ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_analytics"
    ADD CONSTRAINT "client_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_concierge_id_hotel_id_key" UNIQUE ("concierge_id", "hotel_id");



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."gift_code_attempts"
    ADD CONSTRAINT "gift_code_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_hotel_id_key" UNIQUE ("therapist_id", "hotel_id");



ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_rating_token_key" UNIQUE ("rating_token");



ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "hairdressers_phone_country_code_unique" UNIQUE ("phone", "country_code");



ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "hairdressers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_hotel_id_key" UNIQUE ("hotel_id");



ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_kind_therapist_id_hotel_id_period_start_key" UNIQUE ("invoice_kind", "therapist_id", "hotel_id", "period_start");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_rate_limits"
    ADD CONSTRAINT "otp_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_notification_logs"
    ADD CONSTRAINT "push_notification_logs_booking_id_user_id_key" UNIQUE ("booking_id", "user_id");



ALTER TABLE ONLY "public"."push_notification_logs"
    ADD CONSTRAINT "push_notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."therapist_absences"
    ADD CONSTRAINT "therapist_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "therapist_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "therapist_schedule_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_unique" UNIQUE ("parent_treatment_id", "addon_treatment_id");



ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_bundle_id_treatment_id_key" UNIQUE ("bundle_id", "treatment_id");



ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_name_hotel_id_key" UNIQUE ("name", "hotel_id");



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_hotel_slug_key" UNIQUE ("hotel_id", "slug");



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_rooms"
    ADD CONSTRAINT "treatment_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_variants"
    ADD CONSTRAINT "treatment_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "unique_active_proposal_per_booking" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "unique_hotel_schedule" UNIQUE ("hotel_id");



ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "unique_proposed_slots_per_booking" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "unique_therapist_date" UNIQUE ("therapist_id", "date");



ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "unique_therapist_template" UNIQUE ("therapist_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_hotel_id_type_key" UNIQUE ("hotel_id", "type");



ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "bookings_booking_id_idx" ON "public"."bookings" USING "btree" ("booking_id");



CREATE INDEX "idx_admins_email" ON "public"."admins" USING "btree" ("email");



CREATE INDEX "idx_admins_user_id" ON "public"."admins" USING "btree" ("user_id");



CREATE INDEX "idx_amenity_bookings_amenity_date" ON "public"."amenity_bookings" USING "btree" ("venue_amenity_id", "booking_date");



CREATE INDEX "idx_amenity_bookings_customer" ON "public"."amenity_bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "idx_amenity_bookings_venue_date" ON "public"."amenity_bookings" USING "btree" ("hotel_id", "booking_date");



CREATE INDEX "idx_audit_log_bookings" ON "public"."audit_log" USING "btree" ("record_id", "changed_at" DESC) WHERE ("table_name" = 'bookings'::"text");



CREATE INDEX "idx_audit_log_flags" ON "public"."audit_log" USING "btree" ("is_flagged", "acknowledged_at") WHERE (("is_flagged" = true) AND ("acknowledged_at" IS NULL));



CREATE INDEX "idx_audit_log_metadata_therapist" ON "public"."audit_log" USING "btree" ((("metadata" ->> 'therapist_id'::"text"))) WHERE ("table_name" = 'therapist_availability'::"text");



CREATE INDEX "idx_audit_log_table_date" ON "public"."audit_log" USING "btree" ("table_name", "changed_at" DESC);



CREATE INDEX "idx_audit_log_table_record" ON "public"."audit_log" USING "btree" ("table_name", "record_id", "changed_at" DESC);



CREATE INDEX "idx_billing_profiles_owner" ON "public"."billing_profiles" USING "btree" ("owner_type", "owner_id");



CREATE INDEX "idx_blocked_slots_hotel_active" ON "public"."venue_blocked_slots" USING "btree" ("hotel_id") WHERE ("is_active" = true);



CREATE INDEX "idx_booking_notes_booking" ON "public"."booking_notes" USING "btree" ("booking_id", "created_at");



CREATE INDEX "idx_booking_therapists_booking" ON "public"."booking_therapists" USING "btree" ("booking_id");



CREATE INDEX "idx_booking_therapists_therapist" ON "public"."booking_therapists" USING "btree" ("therapist_id");



CREATE INDEX "idx_bookings_awaiting_payment" ON "public"."bookings" USING "btree" ("payment_status", "created_at") WHERE ("payment_status" = 'awaiting_payment'::"text");



CREATE INDEX "idx_bookings_bundle_usage" ON "public"."bookings" USING "btree" ("bundle_usage_id") WHERE ("bundle_usage_id" IS NOT NULL);



CREATE INDEX "idx_bookings_client_type_month" ON "public"."bookings" USING "btree" ("client_type", "booking_date") WHERE ("client_type" = ANY (ARRAY['hotel'::"text", 'staycation'::"text", 'classpass'::"text"]));



CREATE INDEX "idx_bookings_customer" ON "public"."bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "idx_bookings_hold_expires_at" ON "public"."bookings" USING "btree" ("hold_expires_at") WHERE (("status" = 'awaiting_payment'::"text") AND ("hold_expires_at" IS NOT NULL));



CREATE INDEX "idx_bookings_hotel_date" ON "public"."bookings" USING "btree" ("hotel_id", "booking_date");



CREATE INDEX "idx_bookings_payment_failed" ON "public"."bookings" USING "btree" ("payment_status") WHERE ("payment_status" = 'failed'::"text");



CREATE INDEX "idx_bookings_payment_link_sent" ON "public"."bookings" USING "btree" ("payment_link_sent_at") WHERE ("payment_link_url" IS NOT NULL);



CREATE INDEX "idx_bookings_quote_token" ON "public"."bookings" USING "btree" ("quote_token") WHERE ("quote_token" IS NOT NULL);



CREATE INDEX "idx_bookings_room_id" ON "public"."bookings" USING "btree" ("room_id");



CREATE INDEX "idx_bookings_signature_token" ON "public"."bookings" USING "btree" ("signature_token") WHERE ("signature_token" IS NOT NULL);



CREATE INDEX "idx_bundle_amount_usages_booking" ON "public"."bundle_amount_usages" USING "btree" ("booking_id");



CREATE INDEX "idx_bundle_amount_usages_bundle" ON "public"."bundle_amount_usages" USING "btree" ("customer_bundle_id");



CREATE INDEX "idx_bundle_usages_booking" ON "public"."bundle_session_usages" USING "btree" ("booking_id");



CREATE INDEX "idx_bundle_usages_customer_bundle" ON "public"."bundle_session_usages" USING "btree" ("customer_bundle_id");



CREATE INDEX "idx_bundle_usages_treatment" ON "public"."bundle_session_usages" USING "btree" ("treatment_id");



CREATE INDEX "idx_client_analytics_created_at" ON "public"."client_analytics" USING "btree" ("created_at");



CREATE INDEX "idx_client_analytics_event_name" ON "public"."client_analytics" USING "btree" ("event_name");



CREATE INDEX "idx_client_analytics_event_type" ON "public"."client_analytics" USING "btree" ("event_type");



CREATE INDEX "idx_client_analytics_hotel_created" ON "public"."client_analytics" USING "btree" ("hotel_id", "created_at");



CREATE INDEX "idx_client_analytics_hotel_id" ON "public"."client_analytics" USING "btree" ("hotel_id");



CREATE INDEX "idx_client_analytics_session_id" ON "public"."client_analytics" USING "btree" ("session_id");



CREATE INDEX "idx_customer_bundles_active" ON "public"."customer_treatment_bundles" USING "btree" ("customer_id", "hotel_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_customer_bundles_beneficiary" ON "public"."customer_treatment_bundles" USING "btree" ("beneficiary_customer_id") WHERE ("beneficiary_customer_id" IS NOT NULL);



CREATE INDEX "idx_customer_bundles_booking" ON "public"."customer_treatment_bundles" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "idx_customer_bundles_bundle" ON "public"."customer_treatment_bundles" USING "btree" ("bundle_id");



CREATE INDEX "idx_customer_bundles_customer" ON "public"."customer_treatment_bundles" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_bundles_hotel" ON "public"."customer_treatment_bundles" USING "btree" ("hotel_id");



CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_customers_preferred_therapist" ON "public"."customers" USING "btree" ("preferred_therapist_id") WHERE ("preferred_therapist_id" IS NOT NULL);



CREATE INDEX "idx_gift_code_attempts_key_time" ON "public"."gift_code_attempts" USING "btree" ("attempt_key", "created_at" DESC);



CREATE INDEX "idx_hairdresser_payouts_booking_id" ON "public"."therapist_payouts" USING "btree" ("booking_id");



CREATE INDEX "idx_hairdresser_payouts_hairdresser_id" ON "public"."therapist_payouts" USING "btree" ("therapist_id");



CREATE INDEX "idx_hairdresser_payouts_status" ON "public"."therapist_payouts" USING "btree" ("status");



CREATE INDEX "idx_hairdresser_ratings_hairdresser_id" ON "public"."therapist_ratings" USING "btree" ("therapist_id");



CREATE INDEX "idx_hairdresser_ratings_token" ON "public"."therapist_ratings" USING "btree" ("rating_token");



CREATE INDEX "idx_hotel_ledger_booking_id" ON "public"."hotel_ledger" USING "btree" ("booking_id");



CREATE INDEX "idx_hotel_ledger_hotel_id" ON "public"."hotel_ledger" USING "btree" ("hotel_id");



CREATE INDEX "idx_hotel_ledger_status" ON "public"."hotel_ledger" USING "btree" ("status");



CREATE INDEX "idx_invoices_hotel" ON "public"."invoices" USING "btree" ("hotel_id") WHERE ("hotel_id" IS NOT NULL);



CREATE INDEX "idx_invoices_kind" ON "public"."invoices" USING "btree" ("invoice_kind");



CREATE INDEX "idx_invoices_period" ON "public"."invoices" USING "btree" ("period_start");



CREATE INDEX "idx_invoices_therapist" ON "public"."invoices" USING "btree" ("therapist_id") WHERE ("therapist_id" IS NOT NULL);



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_otp_rate_limits_first_attempt" ON "public"."otp_rate_limits" USING "btree" ("first_attempt_at");



CREATE UNIQUE INDEX "idx_otp_rate_limits_phone_type" ON "public"."otp_rate_limits" USING "btree" ("phone_number", "request_type");



CREATE INDEX "idx_proposals_booking_id" ON "public"."booking_alternative_proposals" USING "btree" ("booking_id");



CREATE INDEX "idx_proposals_client_phone" ON "public"."booking_alternative_proposals" USING "btree" ("client_phone");



CREATE INDEX "idx_proposals_hairdresser_id" ON "public"."booking_alternative_proposals" USING "btree" ("hairdresser_id");



CREATE INDEX "idx_proposals_status" ON "public"."booking_alternative_proposals" USING "btree" ("status") WHERE ("status" <> ALL (ARRAY['slot1_accepted'::"text", 'slot2_accepted'::"text", 'all_rejected'::"text", 'expired'::"text"]));



CREATE INDEX "idx_proposed_slots_booking_id" ON "public"."booking_proposed_slots" USING "btree" ("booking_id");



CREATE INDEX "idx_proposed_slots_expires_at" ON "public"."booking_proposed_slots" USING "btree" ("expires_at") WHERE (("validated_slot" IS NULL) AND ("admin_notified_at" IS NULL));



CREATE INDEX "idx_proposed_slots_validated_by" ON "public"."booking_proposed_slots" USING "btree" ("validated_by");



CREATE INDEX "idx_push_notification_logs_booking_user" ON "public"."push_notification_logs" USING "btree" ("booking_id", "user_id");



CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_therapist_absences_date_range" ON "public"."therapist_absences" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_therapist_absences_therapist_date" ON "public"."therapist_absences" USING "btree" ("therapist_id", "start_date", "end_date");



CREATE INDEX "idx_therapist_availability_date" ON "public"."therapist_availability" USING "btree" ("date", "therapist_id") WHERE ("is_available" = true);



CREATE INDEX "idx_therapist_availability_range" ON "public"."therapist_availability" USING "btree" ("therapist_id", "date");



CREATE INDEX "idx_tickets_created_at" ON "public"."tickets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tickets_created_by" ON "public"."tickets" USING "btree" ("created_by");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_treatment_addons_addon" ON "public"."treatment_addons" USING "btree" ("addon_treatment_id");



CREATE INDEX "idx_treatment_addons_parent" ON "public"."treatment_addons" USING "btree" ("parent_treatment_id");



CREATE INDEX "idx_treatment_bundle_items_bundle" ON "public"."treatment_bundle_items" USING "btree" ("bundle_id");



CREATE INDEX "idx_treatment_bundle_items_treatment" ON "public"."treatment_bundle_items" USING "btree" ("treatment_id");



CREATE INDEX "idx_treatment_bundles_hotel" ON "public"."treatment_bundles" USING "btree" ("hotel_id");



CREATE INDEX "idx_treatment_bundles_status" ON "public"."treatment_bundles" USING "btree" ("status");



CREATE INDEX "idx_treatment_bundles_type" ON "public"."treatment_bundles" USING "btree" ("hotel_id", "bundle_type");



CREATE INDEX "idx_treatment_categories_hotel_id" ON "public"."treatment_categories" USING "btree" ("hotel_id");



CREATE INDEX "idx_treatment_menus_bundle" ON "public"."treatment_menus" USING "btree" ("bundle_id") WHERE ("bundle_id" IS NOT NULL);



CREATE INDEX "idx_treatment_menus_is_addon" ON "public"."treatment_menus" USING "btree" ("hotel_id", "is_addon") WHERE ("is_addon" = true);



CREATE INDEX "idx_treatment_rooms_capabilities" ON "public"."treatment_rooms" USING "gin" ("capabilities");



CREATE INDEX "idx_treatment_variants_treatment_id" ON "public"."treatment_variants" USING "btree" ("treatment_id");



CREATE INDEX "idx_venue_amenities_hotel" ON "public"."venue_amenities" USING "btree" ("hotel_id");



CREATE INDEX "idx_venue_deployment_schedules_hotel_id" ON "public"."venue_deployment_schedules" USING "btree" ("hotel_id");



CREATE UNIQUE INDEX "uq_ctb_redemption_code" ON "public"."customer_treatment_bundles" USING "btree" ("redemption_code") WHERE ("redemption_code" IS NOT NULL);



CREATE UNIQUE INDEX "uq_customers_auth_user_id" ON "public"."customers" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "hotels_autofill_slug_trigger" BEFORE INSERT ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."hotels_autofill_slug"();



CREATE OR REPLACE TRIGGER "on_booking_cancelled" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_cancellation_notifications"();



CREATE OR REPLACE TRIGGER "sync_concierge_timezone" AFTER INSERT ON "public"."concierge_hotels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();



CREATE OR REPLACE TRIGGER "sync_hairdresser_timezone" AFTER INSERT ON "public"."therapist_venues" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();



CREATE OR REPLACE TRIGGER "treatment_menus_autofill_slug_trigger" BEFORE INSERT ON "public"."treatment_menus" FOR EACH ROW EXECUTE FUNCTION "public"."treatment_menus_autofill_slug"();



CREATE OR REPLACE TRIGGER "trg_booking_audit" AFTER INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."log_booking_change"();



CREATE OR REPLACE TRIGGER "trg_therapist_availability_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."therapist_availability" FOR EACH ROW EXECUTE FUNCTION "public"."log_therapist_availability_change"();



CREATE OR REPLACE TRIGGER "trg_ticket_closed_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_ticket_closed_at"();



CREATE OR REPLACE TRIGGER "trigger_treatment_categories_updated_at" BEFORE UPDATE ON "public"."treatment_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_treatment_categories_updated_at"();



CREATE OR REPLACE TRIGGER "update_admins_updated_at" BEFORE UPDATE ON "public"."admins" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_amenity_bookings_updated_at" BEFORE UPDATE ON "public"."amenity_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_billing_profiles_updated_at" BEFORE UPDATE ON "public"."billing_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_concierges_updated_at" BEFORE UPDATE ON "public"."concierges" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customer_treatment_bundles_updated_at" BEFORE UPDATE ON "public"."customer_treatment_bundles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hairdresser_payouts_updated_at" BEFORE UPDATE ON "public"."therapist_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hairdressers_updated_at" BEFORE UPDATE ON "public"."therapists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hotel_ledger_updated_at" BEFORE UPDATE ON "public"."hotel_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_treatment_bundles_updated_at" BEFORE UPDATE ON "public"."treatment_bundles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_treatment_menus_updated_at" BEFORE UPDATE ON "public"."treatment_menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_venue_amenities_updated_at" BEFORE UPDATE ON "public"."venue_amenities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_linked_booking_id_fkey" FOREIGN KEY ("linked_booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_venue_amenity_id_fkey" FOREIGN KEY ("venue_amenity_id") REFERENCES "public"."venue_amenities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."therapists"("id");



ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."therapists"("id");



ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."treatment_variants"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_bundle_usage_id_fkey" FOREIGN KEY ("bundle_usage_id") REFERENCES "public"."bundle_session_usages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_trunk_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."treatment_rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_customer_bundle_id_fkey" FOREIGN KEY ("customer_bundle_id") REFERENCES "public"."customer_treatment_bundles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_customer_bundle_id_fkey" FOREIGN KEY ("customer_bundle_id") REFERENCES "public"."customer_treatment_bundles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_analytics"
    ADD CONSTRAINT "client_analytics_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_concierge_id_fkey" FOREIGN KEY ("concierge_id") REFERENCES "public"."concierges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_beneficiary_customer_id_fkey" FOREIGN KEY ("beneficiary_customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_preferred_therapist_id_fkey" FOREIGN KEY ("preferred_therapist_id") REFERENCES "public"."therapists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_absences"
    ADD CONSTRAINT "therapist_absences_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "therapist_availability_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "therapist_schedule_templates_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_addon_treatment_id_fkey" FOREIGN KEY ("addon_treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_parent_treatment_id_fkey" FOREIGN KEY ("parent_treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_variants"
    ADD CONSTRAINT "treatment_variants_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_rooms"
    ADD CONSTRAINT "trunks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and concierge can read analytics" ON "public"."client_analytics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"]))))));



CREATE POLICY "Admin can manage PMS configs" ON "public"."hotel_pms_configs" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create admins" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create booking treatments" ON "public"."booking_treatments" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create bookings" ON "public"."bookings" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create concierge hotels" ON "public"."concierge_hotels" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create concierges" ON "public"."concierges" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create hotels" ON "public"."hotels" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create treatment menus" ON "public"."treatment_menus" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create treatment rooms" ON "public"."treatment_rooms" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete admins" ON "public"."admins" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete booking treatments" ON "public"."booking_treatments" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete bookings" ON "public"."bookings" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete concierge hotels" ON "public"."concierge_hotels" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete concierges" ON "public"."concierges" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete hairdressers" ON "public"."therapists" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete hotels" ON "public"."hotels" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete push notification logs" ON "public"."push_notification_logs" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete their own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "Admins can delete treatment menus" ON "public"."treatment_menus" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete treatment rooms" ON "public"."treatment_rooms" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete venue deployment schedules" ON "public"."venue_deployment_schedules" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert hairdressers" ON "public"."therapists" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert push notification logs" ON "public"."push_notification_logs" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert venue deployment schedules" ON "public"."venue_deployment_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage amenity bookings" ON "public"."amenity_bookings" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage amount usages" ON "public"."bundle_amount_usages" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage billing_profiles" ON "public"."billing_profiles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage booking_therapists" ON "public"."booking_therapists" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage bundle items" ON "public"."treatment_bundle_items" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage bundle usages" ON "public"."bundle_session_usages" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage bundles" ON "public"."treatment_bundles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage categories" ON "public"."treatment_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "Admins can manage customer bundles" ON "public"."customer_treatment_bundles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage customers" ON "public"."customers" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage hairdresser hotels" ON "public"."therapist_venues" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage invoices" ON "public"."invoices" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage ledger" ON "public"."hotel_ledger" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage payouts" ON "public"."therapist_payouts" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage venue amenities" ON "public"."venue_amenities" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage venue blocked slots" ON "public"."venue_blocked_slots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update admins" ON "public"."admins" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update bookings" ON "public"."bookings" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update concierge hotels" ON "public"."concierge_hotels" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update concierges" ON "public"."concierges" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update hairdressers" ON "public"."therapists" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update hotels" ON "public"."hotels" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "Admins can update treatment menus" ON "public"."treatment_menus" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update treatment rooms" ON "public"."treatment_rooms" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update venue deployment schedules" ON "public"."venue_deployment_schedules" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all booking treatments" ON "public"."booking_treatments" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all bookings" ON "public"."bookings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all concierge hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all concierges" ON "public"."concierges" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all hotels" ON "public"."hotels" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all ratings" ON "public"."therapist_ratings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all treatment menus" ON "public"."treatment_menus" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all treatment rooms" ON "public"."treatment_rooms" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view hairdresser hotels" ON "public"."therapist_venues" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view hairdressers" ON "public"."therapists" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view push notification logs" ON "public"."push_notification_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow anonymous inserts" ON "public"."client_analytics" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow public read bookings" ON "public"."bookings" FOR SELECT TO "anon" USING (("signature_token" IS NOT NULL));



CREATE POLICY "Anyone can read active treatment variants" ON "public"."treatment_variants" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Authenticated users can insert proposed slots" ON "public"."booking_proposed_slots" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage treatment variants" ON "public"."treatment_variants" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view proposed slots" ON "public"."booking_proposed_slots" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Block all user access to otp_rate_limits" ON "public"."otp_rate_limits" USING (false);



CREATE POLICY "Block anonymous access to admins" ON "public"."admins" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to amenity bookings" ON "public"."amenity_bookings" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to amount usages" ON "public"."bundle_amount_usages" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to billing_profiles" ON "public"."billing_profiles" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to bookings" ON "public"."bookings" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to bundle usages" ON "public"."bundle_session_usages" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to concierges" ON "public"."concierges" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to customer bundles" ON "public"."customer_treatment_bundles" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to customers" ON "public"."customers" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hairdresser_payouts" ON "public"."therapist_payouts" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hairdressers" ON "public"."therapists" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hotel_ledger" ON "public"."hotel_ledger" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to invoices" ON "public"."invoices" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to notifications" ON "public"."notifications" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to profiles" ON "public"."profiles" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Block anonymous access to user_roles" ON "public"."user_roles" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to venue amenities" ON "public"."venue_amenities" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous select on hairdresser_ratings" ON "public"."therapist_ratings" AS RESTRICTIVE FOR SELECT TO "anon" USING (false);



CREATE POLICY "Block direct access to gift code attempts" ON "public"."gift_code_attempts" AS RESTRICTIVE TO "authenticated", "anon" USING (false);



CREATE POLICY "Concierges can create amenity bookings for their hotels" ON "public"."amenity_bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can create booking treatments for their hotels" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can create bookings for their hotels" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can delete amenity bookings for their hotels" ON "public"."amenity_bookings" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can delete booking treatments from their hotels" ON "public"."booking_treatments" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can delete bookings from their hotels" ON "public"."bookings" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can insert customer bundles" ON "public"."customer_treatment_bundles" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can manage venue amenities for their hotels" ON "public"."venue_amenities" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can update amenity bookings for their hotels" ON "public"."amenity_bookings" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can update bookings from their hotels" ON "public"."bookings" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can update their own profile" ON "public"."concierges" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Concierges can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view amenity bookings for their hotels" ON "public"."amenity_bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view booking treatments from their hotels" ON "public"."booking_treatments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view booking_therapists for their hotels" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."concierge_hotels" "ch" ON (("ch"."hotel_id" = "b"."hotel_id")))
  WHERE (("b"."id" = "booking_therapists"."booking_id") AND ("ch"."concierge_id" = "auth"."uid"()))))));



CREATE POLICY "Concierges can view bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view bundle usages" ON "public"."bundle_session_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view bundles" ON "public"."treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view concierges from their hotels" ON "public"."concierges" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view customer bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view customers" ON "public"."customers" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view hairdresser hotels from their hotels" ON "public"."therapist_venues" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view hairdressers from their hotels" ON "public"."therapists" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."therapist_id" AS "hairdresser_id"
   FROM "public"."therapist_venues" "hh"
  WHERE ("hh"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view hairdressers from their hotels (read-only)" ON "public"."therapists" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."therapist_id" AS "hairdresser_id"
   FROM "public"."therapist_venues" "hh"
  WHERE ("hh"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view their hotel associations" ON "public"."concierge_hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view their hotels" ON "public"."hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view their own profile" ON "public"."concierges" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Concierges can view treatment menus from their hotels" ON "public"."treatment_menus" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))) OR ("hotel_id" IS NULL))));



CREATE POLICY "Concierges can view treatment menus from their hotels (read-onl" ON "public"."treatment_menus" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))) OR ("hotel_id" IS NULL))));



CREATE POLICY "Concierges can view treatment rooms from their hotels" ON "public"."treatment_rooms" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view treatment rooms from their hotels (read-onl" ON "public"."treatment_rooms" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view venue amenities for their hotels" ON "public"."venue_amenities" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Customer can read own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Customer can read own bundles" ON "public"."customer_treatment_bundles" FOR SELECT TO "authenticated" USING (("beneficiary_customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Customer can read own profile" ON "public"."customers" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "Customer can update own profile" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "Customers can update their own profile" ON "public"."customers" FOR UPDATE USING ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"()))) WITH CHECK ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"())));



CREATE POLICY "Customers can view their own amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."customer_treatment_bundles" "ctb"
     JOIN "public"."customers" "c" ON (("c"."id" = "ctb"."beneficiary_customer_id")))
  WHERE (("ctb"."id" = "bundle_amount_usages"."customer_bundle_id") AND ("c"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view their own bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ((("beneficiary_customer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_treatment_bundles"."beneficiary_customer_id") AND ("c"."auth_user_id" = "auth"."uid"()))))));



CREATE POLICY "Customers can view their own profile" ON "public"."customers" FOR SELECT USING ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"())));



CREATE POLICY "Enable read access for authenticated users" ON "public"."booking_payment_infos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Hairdressers can create proposals" ON "public"."booking_alternative_proposals" FOR INSERT WITH CHECK (("hairdresser_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can create their own profile" ON "public"."therapists" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can delete their own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can update their own bookings" ON "public"."bookings" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))) WITH CHECK ((("therapist_id" IS NULL) OR ("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Hairdressers can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))) WITH CHECK (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can update their own profile" ON "public"."therapists" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can view admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));



CREATE POLICY "Hairdressers can view proposed slots" ON "public"."booking_proposed_slots" FOR SELECT USING (("booking_id" IN ( SELECT "b"."id"
   FROM (("public"."bookings" "b"
     JOIN "public"."therapist_venues" "hh" ON (("b"."hotel_id" = "hh"."hotel_id")))
     JOIN "public"."therapists" "h" ON (("hh"."therapist_id" = "h"."id")))
  WHERE ("h"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view their own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view their own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view their own profile" ON "public"."therapists" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can view their proposals" ON "public"."booking_alternative_proposals" FOR SELECT USING (("hairdresser_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view treatments for their bookings" ON "public"."booking_treatments" FOR SELECT TO "authenticated" USING (("booking_id" IN ( SELECT "bookings"."id"
   FROM "public"."bookings"
  WHERE ("bookings"."therapist_id" IN ( SELECT "therapists"."id"
           FROM "public"."therapists"
          WHERE ("therapists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Public can insert ratings with valid token" ON "public"."therapist_ratings" FOR INSERT WITH CHECK (("rating_token" IS NOT NULL));



CREATE POLICY "Public can read categories" ON "public"."treatment_categories" FOR SELECT USING (true);



CREATE POLICY "Public can update ratings once with valid token" ON "public"."therapist_ratings" FOR UPDATE USING ((("rating_token" IS NOT NULL) AND ("submitted_at" IS NULL))) WITH CHECK (("rating_token" IS NOT NULL));



CREATE POLICY "Public can view active bundles" ON "public"."treatment_bundles" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Public can view bundle items" ON "public"."treatment_bundle_items" FOR SELECT USING (true);



CREATE POLICY "Public can view venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Purchasers can view their sent gifts" ON "public"."customer_treatment_bundles" FOR SELECT USING ((("is_gift" = true) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_treatment_bundles"."customer_id") AND ("c"."auth_user_id" = "auth"."uid"()))))));



CREATE POLICY "Service role full access" ON "public"."booking_alternative_proposals" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."booking_proposed_slots" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on venue blocked slots" ON "public"."venue_blocked_slots" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role handles payment infos" ON "public"."booking_payment_infos" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "System can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "notifications"."user_id") AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'therapist'::"public"."app_role"]))))));



CREATE POLICY "Therapist can delete treatment if assigned to booking" ON "public"."booking_treatments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapists" "t" ON (("t"."id" = "b"."therapist_id")))
  WHERE (("b"."id" = "booking_treatments"."booking_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Therapists can create bookings for their hotels" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));



CREATE POLICY "Therapists can create treatments for pending bookings in thei" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND ("b"."therapist_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));



CREATE POLICY "Therapists can create treatments for their own bookings" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));



CREATE POLICY "Therapists can delete treatments for pending bookings in thei" ON "public"."booking_treatments" FOR DELETE USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND ("b"."therapist_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));



CREATE POLICY "Therapists can view amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));



CREATE POLICY "Therapists can view assignments for their bookings" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING ("public"."is_booking_participant"("booking_id", "public"."get_therapist_id"("auth"."uid"())));



CREATE POLICY "Therapists can view booking_therapists for awaiting bookings at" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapist_venues" "tv" ON (("tv"."hotel_id" = "b"."hotel_id")))
  WHERE (("b"."id" = "booking_therapists"."booking_id") AND ("b"."status" = 'awaiting_hairdresser_selection'::"text") AND ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())) AND (NOT ("public"."get_therapist_id"("auth"."uid"()) = ANY (COALESCE("b"."declined_by", ARRAY[]::"uuid"[]))))))));



CREATE POLICY "Therapists can view bookings they joined as secondary" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_booking_participant"("id", "public"."get_therapist_id"("auth"."uid"())));



CREATE POLICY "Therapists can view bundle usages" ON "public"."bundle_session_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));



CREATE POLICY "Therapists can view concierge hotels from their hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));



CREATE POLICY "Therapists can view concierges from their hotels" ON "public"."concierges" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));



CREATE POLICY "Therapists can view customer bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));



CREATE POLICY "Therapists can view customers" ON "public"."customers" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));



CREATE POLICY "Therapists can view hotels from their bookings" ON "public"."hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("id" IN ( SELECT DISTINCT "b"."hotel_id"
   FROM "public"."bookings" "b"
  WHERE ("b"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));



CREATE POLICY "Therapists can view own billing_profile" ON "public"."billing_profiles" FOR SELECT USING ((("owner_type" = 'therapist'::"text") AND ("owner_id" = ( SELECT ("therapists"."id")::"text" AS "id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Therapists can view own invoices" ON "public"."invoices" FOR SELECT USING (("therapist_id" = ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Therapists can view pending bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND (("therapist_id" IS NULL) OR (("status" = 'awaiting_hairdresser_selection'::"text") AND ("guest_count" > 1))) AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())))) AND (NOT ("public"."get_therapist_id"("auth"."uid"()) = ANY (COALESCE("declined_by", ARRAY[]::"uuid"[]))))));



CREATE POLICY "Therapists can view their own hotel associations" ON "public"."therapist_venues" FOR SELECT TO "authenticated" USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));



CREATE POLICY "Therapists can view their own ratings" ON "public"."therapist_ratings" FOR SELECT USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));



CREATE POLICY "Therapists can view their payouts" ON "public"."therapist_payouts" FOR SELECT USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));



CREATE POLICY "Therapists can view treatment menus from their hotels" ON "public"."treatment_menus" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND (("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())))) OR ("hotel_id" IS NULL))));



CREATE POLICY "Therapists can view treatments for pending bookings" ON "public"."booking_treatments" FOR SELECT USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND (("b"."therapist_id" IS NULL) OR (("b"."status" = 'awaiting_hairdresser_selection'::"text") AND ("b"."guest_count" > 1))) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));



CREATE POLICY "Users can delete their own push subscriptions" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own push tokens" ON "public"."push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own push subscriptions" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push subscriptions" ON "public"."push_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own push tokens" ON "public"."push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_all_absences" ON "public"."therapist_absences" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_all_availability" ON "public"."therapist_availability" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_all_templates" ON "public"."therapist_schedule_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_read_audit_log" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_update_audit_log" ON "public"."audit_log" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_select_all_tickets" ON "public"."tickets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admins_update_tickets" ON "public"."tickets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



ALTER TABLE "public"."amenity_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_tickets" ON "public"."tickets" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."billing_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_alternative_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_payment_infos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_proposed_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_therapists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_treatments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_amount_usages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_session_usages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concierge_hotels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concierges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_treatment_bundles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_code_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_pms_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_delete_own_booking_notes" ON "public"."booking_notes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "staff_insert_booking_notes" ON "public"."booking_notes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"])))))));



CREATE POLICY "staff_read_booking_notes" ON "public"."booking_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"]))))));



ALTER TABLE "public"."therapist_absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapist_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "therapist_booking_audit_log" ON "public"."audit_log" FOR SELECT USING ((("table_name" = 'bookings'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapists" "t" ON (("t"."id" = "b"."therapist_id")))
  WHERE ((("b"."id")::"text" = "audit_log"."record_id") AND ("t"."user_id" = "auth"."uid"()))))));



CREATE POLICY "therapist_own_absences_delete" ON "public"."therapist_absences" FOR DELETE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_absences_insert" ON "public"."therapist_absences" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_absences_select" ON "public"."therapist_absences" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_absences_update" ON "public"."therapist_absences" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_audit_log" ON "public"."audit_log" FOR SELECT USING ((("table_name" = 'therapist_availability'::"text") AND (("metadata" ->> 'therapist_id'::"text") IN ( SELECT ("therapists"."id")::"text" AS "id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));



CREATE POLICY "therapist_own_availability_delete" ON "public"."therapist_availability" FOR DELETE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_availability_insert" ON "public"."therapist_availability" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_availability_select" ON "public"."therapist_availability" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_availability_update" ON "public"."therapist_availability" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_template_insert" ON "public"."therapist_schedule_templates" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_template_select" ON "public"."therapist_schedule_templates" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



CREATE POLICY "therapist_own_template_update" ON "public"."therapist_schedule_templates" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."therapist_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapist_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapist_schedule_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapist_venues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_addons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "treatment_addons_admin_write" ON "public"."treatment_addons" USING ((EXISTS ( SELECT 1
   FROM "public"."treatment_menus" "tm"
  WHERE (("tm"."id" = "treatment_addons"."parent_treatment_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."treatment_menus" "tm"
  WHERE (("tm"."id" = "treatment_addons"."parent_treatment_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))));



CREATE POLICY "treatment_addons_public_read" ON "public"."treatment_addons" FOR SELECT USING (true);



ALTER TABLE "public"."treatment_bundle_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_bundles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_own_tickets" ON "public"."tickets" FOR SELECT USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."venue_amenities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venue_blocked_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venue_deployment_schedules" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."amenity_bookings";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































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



GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text", "_therapist_gender" "text", "_stripe_session_id" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



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
























GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."amenity_bookings" TO "anon";
GRANT ALL ON TABLE "public"."amenity_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."amenity_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."billing_profiles" TO "anon";
GRANT ALL ON TABLE "public"."billing_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "anon";
GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."booking_notes" TO "anon";
GRANT ALL ON TABLE "public"."booking_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_notes" TO "service_role";



GRANT ALL ON TABLE "public"."booking_payment_infos" TO "anon";
GRANT ALL ON TABLE "public"."booking_payment_infos" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_payment_infos" TO "service_role";



GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "anon";
GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "service_role";



GRANT ALL ON TABLE "public"."booking_therapists" TO "anon";
GRANT ALL ON TABLE "public"."booking_therapists" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_therapists" TO "service_role";



GRANT ALL ON TABLE "public"."booking_treatments" TO "anon";
GRANT ALL ON TABLE "public"."booking_treatments" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_treatments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "anon";
GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_session_usages" TO "anon";
GRANT ALL ON TABLE "public"."bundle_session_usages" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_session_usages" TO "service_role";



GRANT ALL ON TABLE "public"."client_analytics" TO "anon";
GRANT ALL ON TABLE "public"."client_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."client_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."concierge_hotels" TO "anon";
GRANT ALL ON TABLE "public"."concierge_hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."concierge_hotels" TO "service_role";



GRANT ALL ON TABLE "public"."concierges" TO "anon";
GRANT ALL ON TABLE "public"."concierges" TO "authenticated";
GRANT ALL ON TABLE "public"."concierges" TO "service_role";



GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "anon";
GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."gift_code_attempts" TO "anon";
GRANT ALL ON TABLE "public"."gift_code_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_code_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."hotel_ledger" TO "anon";
GRANT ALL ON TABLE "public"."hotel_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "anon";
GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "service_role";



GRANT ALL ON TABLE "public"."hotels" TO "anon";
GRANT ALL ON TABLE "public"."hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."hotels" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."otp_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."otp_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."otp_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."push_notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."push_notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_absences" TO "anon";
GRANT ALL ON TABLE "public"."therapist_absences" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_absences" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_availability" TO "anon";
GRANT ALL ON TABLE "public"."therapist_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_availability" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_payouts" TO "anon";
GRANT ALL ON TABLE "public"."therapist_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_ratings" TO "anon";
GRANT ALL ON TABLE "public"."therapist_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "anon";
GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "service_role";



GRANT ALL ON TABLE "public"."therapist_venues" TO "anon";
GRANT ALL ON TABLE "public"."therapist_venues" TO "authenticated";
GRANT ALL ON TABLE "public"."therapist_venues" TO "service_role";



GRANT ALL ON TABLE "public"."therapists" TO "anon";
GRANT ALL ON TABLE "public"."therapists" TO "authenticated";
GRANT ALL ON TABLE "public"."therapists" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_addons" TO "anon";
GRANT ALL ON TABLE "public"."treatment_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_addons" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "anon";
GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_bundles" TO "anon";
GRANT ALL ON TABLE "public"."treatment_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_categories" TO "anon";
GRANT ALL ON TABLE "public"."treatment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_menus" TO "anon";
GRANT ALL ON TABLE "public"."treatment_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_menus" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_rooms" TO "anon";
GRANT ALL ON TABLE "public"."treatment_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_variants" TO "anon";
GRANT ALL ON TABLE "public"."treatment_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_variants" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."venue_amenities" TO "anon";
GRANT ALL ON TABLE "public"."venue_amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_amenities" TO "service_role";



GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "anon";
GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "service_role";



GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "anon";
GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































