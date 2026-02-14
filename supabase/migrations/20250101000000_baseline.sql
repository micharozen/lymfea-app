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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'moderator',
    'user',
    'concierge',
    'hairdresser'
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
  _current_hairdresser_id uuid;
BEGIN
  -- SECURITY: Verify caller owns the hairdresser record
  IF NOT EXISTS (
    SELECT 1 FROM hairdressers 
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT hairdresser_id INTO _current_hairdresser_id
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NOT NULL AND _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = _hairdresser_id,
    hairdresser_name = _hairdresser_name,
    status = 'confirmed',
    assigned_at = now(),
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'hairdresser_id', hairdresser_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;


ALTER FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.hairdressers WHERE user_id = _user_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text") RETURNS TABLE("id" "text", "first_name" "text", "profile_image" "text", "skills" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT h.id, h.first_name, h.profile_image, h.skills
  FROM hairdressers h
  INNER JOIN hairdresser_hotels hh ON h.id = hh.hairdresser_id
  WHERE hh.hotel_id = _hotel_id AND h.status IN ('Active', 'Actif', 'active')
  ORDER BY h.first_name;
$$;


ALTER FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") RETURNS TABLE("id" "text", "name" "text", "image" "text", "cover_image" "text", "city" "text", "country" "text", "currency" "text", "status" "text", "vat" numeric, "opening_time" time without time zone, "closing_time" time without time zone, "schedule_type" "text", "days_of_week" integer[], "recurrence_interval" integer, "recurring_start_date" "date", "recurring_end_date" "date", "venue_type" "text")
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
    h.venue_type
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


CREATE OR REPLACE FUNCTION "public"."get_public_treatments"("_hotel_id" "text") RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "category" "text", "service_for" "text", "duration" integer, "price" numeric, "price_on_request" boolean, "lead_time" integer, "image" "text", "sort_order" integer, "currency" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    t.id,
    t.name,
    t.description,
    t.category,
    t.service_for,
    t.duration,
    t.price,
    t.price_on_request,
    t.lead_time,
    t.image,
    t.sort_order,
    t.currency
  FROM public.treatment_menus t
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;


ALTER FUNCTION "public"."get_public_treatments"("_hotel_id" "text") OWNER TO "postgres";


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
  
  -- If an admin record was found and updated, assign admin role
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
  
  -- If a concierge record was found and updated, assign concierge role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'concierge')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;
  
  -- Find matching hairdresser by email and update their user_id
  UPDATE public.hairdressers
  SET 
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If a hairdresser record was found and updated, assign hairdresser role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'hairdresser')
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
    RETURN _schedule.specific_dates IS NOT NULL AND _check_date::TEXT = ANY(_schedule.specific_dates);
  END IF;

  -- Default: not available
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_venue_available_on_date(_hotel_id, _check_date::DATE);
$$;


ALTER FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "text") OWNER TO "postgres";


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
  hairdresser_user_id UUID;
BEGIN
  -- Vérifier si un coiffeur a été assigné (nouveau ou changé)
  IF NEW.hairdresser_id IS NOT NULL AND 
     (OLD.hairdresser_id IS NULL OR OLD.hairdresser_id != NEW.hairdresser_id) THEN
    
    -- Récupérer le user_id du coiffeur assigné
    SELECT user_id INTO hairdresser_user_id
    FROM public.hairdressers
    WHERE id = NEW.hairdresser_id;

    -- Si le coiffeur a un user_id, créer une notification
    IF hairdresser_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_user_id,
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
  hairdresser_user_id UUID;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.hairdresser_id IS NOT NULL THEN
    SELECT user_id INTO hairdresser_user_id
    FROM public.hairdressers
    WHERE id = NEW.hairdresser_id;

    IF hairdresser_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_user_id,
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
  hairdresser_record RECORD;
BEGIN
  IF NEW.status = 'pending' THEN
    FOR hairdresser_record IN (
      SELECT h.user_id, h.first_name, h.last_name
      FROM public.hairdressers h
      INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
      WHERE hh.hotel_id = NEW.hotel_id
        AND h.user_id IS NOT NULL
        AND h.status = 'active'
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_record.user_id,
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
  hairdresser_record RECORD;
BEGIN
  IF OLD.hairdresser_id IS NOT NULL AND 
     NEW.hairdresser_id IS NULL AND 
     NEW.status = 'pending' THEN
    
    FOR hairdresser_record IN (
      SELECT h.user_id, h.first_name, h.last_name, h.id
      FROM public.hairdressers h
      INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
      WHERE hh.hotel_id = NEW.hotel_id
        AND h.user_id IS NOT NULL
        AND h.status = 'active'
        AND NOT (h.id = ANY(COALESCE(NEW.declined_by, ARRAY[]::uuid[])))
    ) LOOP
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_record.user_id,
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


CREATE OR REPLACE FUNCTION "public"."sync_profile_timezone_from_hotel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _user_id UUID;
  _hotel_timezone TEXT;
BEGIN
  -- Get user_id and hotel timezone for concierge
  IF TG_TABLE_NAME = 'concierge_hotels' THEN
    SELECT c.user_id INTO _user_id 
    FROM concierges c 
    WHERE c.id = NEW.concierge_id;
    
    SELECT h.timezone INTO _hotel_timezone 
    FROM hotels h 
    WHERE h.id = NEW.hotel_id;
  -- Get user_id and hotel timezone for hairdresser
  ELSIF TG_TABLE_NAME = 'hairdresser_hotels' THEN
    SELECT h.user_id INTO _user_id 
    FROM hairdressers h 
    WHERE h.id = NEW.hairdresser_id;
    
    SELECT ht.timezone INTO _hotel_timezone 
    FROM hotels ht 
    WHERE ht.id = NEW.hotel_id;
  END IF;
  
  -- Only proceed if we have a user_id and timezone
  IF _user_id IS NOT NULL AND _hotel_timezone IS NOT NULL THEN
    INSERT INTO profiles (user_id, timezone)
    VALUES (_user_id, _hotel_timezone)
    ON CONFLICT (user_id) 
    DO UPDATE SET timezone = _hotel_timezone, updated_at = now()
    WHERE profiles.timezone = 'Europe/Paris'; -- Only update if still default
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_timezone_from_hotel"() OWNER TO "postgres";


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
  _current_hairdresser_id uuid;
  _current_declined_by uuid[];
BEGIN
  -- SECURITY: Verify caller owns the hairdresser record
  IF NOT EXISTS (
    SELECT 1 FROM hairdressers 
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT hairdresser_id, COALESCE(declined_by, ARRAY[]::uuid[]) 
  INTO _current_hairdresser_id, _current_declined_by
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NULL OR _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_assigned_to_you');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = NULL,
    hairdresser_name = NULL,
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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


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



CREATE TABLE IF NOT EXISTS "public"."booking_treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "hairdresser_id" "uuid",
    "hairdresser_name" "text",
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
    "trunk_id" "uuid",
    "duration" integer,
    "payment_link_url" "text",
    "payment_link_sent_at" timestamp with time zone,
    "payment_link_channels" "text"[],
    "payment_link_language" "text",
    CONSTRAINT "bookings_payment_link_language_check" CHECK (("payment_link_language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "bookings_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['room'::"text", 'card'::"text"]))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'charged_to_room'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."status" IS 'Valid values: pending, confirmed, ongoing, completed, cancelled, noshow';



COMMENT ON COLUMN "public"."bookings"."declined_by" IS 'Array of hairdresser IDs who have declined or unassigned from this booking';



COMMENT ON COLUMN "public"."bookings"."payment_link_url" IS 'Stripe Payment Link URL sent to client';



COMMENT ON COLUMN "public"."bookings"."payment_link_sent_at" IS 'Timestamp when payment link was sent';



COMMENT ON COLUMN "public"."bookings"."payment_link_channels" IS 'Channels used to send link: email, whatsapp';



COMMENT ON COLUMN "public"."bookings"."payment_link_language" IS 'Language of the payment link message: fr or en';



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
    "must_change_password" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."concierges" OWNER TO "postgres";


COMMENT ON COLUMN "public"."concierges"."must_change_password" IS 'Flag to force password change on first login';



CREATE TABLE IF NOT EXISTS "public"."hairdresser_hotels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hairdresser_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hairdresser_hotels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hairdresser_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT 'a0000000-0000-0000-0000-000000000001'::"uuid",
    "hairdresser_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "stripe_transfer_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hairdresser_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."hairdresser_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hairdresser_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "hairdresser_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "rating_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    CONSTRAINT "hairdresser_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."hairdresser_ratings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hairdresser_ratings"."submitted_at" IS 'Timestamp when client finalized their rating - prevents subsequent updates';



CREATE TABLE IF NOT EXISTS "public"."hairdressers" (
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
    "stripe_onboarding_completed" boolean DEFAULT false
);


ALTER TABLE "public"."hairdressers" OWNER TO "postgres";


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
    "hairdresser_commission" numeric(5,2) DEFAULT 70.00,
    "status" "text" DEFAULT 'active'::"text",
    "country_code" "text" DEFAULT 'FR'::"text",
    "timezone" "text" DEFAULT 'Europe/Paris'::"text",
    "venue_type" "text" DEFAULT 'hotel'::"text",
    "opening_time" time without time zone DEFAULT '06:00:00'::time without time zone,
    "closing_time" time without time zone DEFAULT '23:00:00'::time without time zone,
    "auto_validate_bookings" boolean DEFAULT false,
    CONSTRAINT "check_venue_hours" CHECK (("opening_time" < "closing_time")),
    CONSTRAINT "hotels_venue_type_check" CHECK (("venue_type" = ANY (ARRAY['hotel'::"text", 'coworking'::"text"])))
);


ALTER TABLE "public"."hotels" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hotels"."opening_time" IS 'Venue opening time for bookings (24h format)';



COMMENT ON COLUMN "public"."hotels"."closing_time" IS 'Venue closing time for bookings (24h format)';



COMMENT ON COLUMN "public"."hotels"."auto_validate_bookings" IS 'When true and only 1 active hairdresser is assigned to the venue, bookings are automatically confirmed without manual hairdresser validation';



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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
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


CREATE TABLE IF NOT EXISTS "public"."treatment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
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
    "currency" "text" DEFAULT 'EUR'::"text"
);


ALTER TABLE "public"."treatment_menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "trunk_model" "text" NOT NULL,
    "trunk_id" "text" NOT NULL,
    "image" "text",
    "hotel_id" "text",
    "hotel_name" "text",
    "hairdresser_name" "text",
    "next_booking" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trunks"
    ADD CONSTRAINT "boxes_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."hairdresser_hotels"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_hotel_id_key" UNIQUE ("hairdresser_id", "hotel_id");



ALTER TABLE ONLY "public"."hairdresser_hotels"
    ADD CONSTRAINT "hairdresser_hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hairdresser_payouts"
    ADD CONSTRAINT "hairdresser_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hairdresser_ratings"
    ADD CONSTRAINT "hairdresser_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hairdresser_ratings"
    ADD CONSTRAINT "hairdresser_ratings_rating_token_key" UNIQUE ("rating_token");



ALTER TABLE ONLY "public"."hairdressers"
    ADD CONSTRAINT "hairdressers_phone_country_code_unique" UNIQUE ("phone", "country_code");



ALTER TABLE ONLY "public"."hairdressers"
    ADD CONSTRAINT "hairdressers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_name_hotel_id_key" UNIQUE ("name", "hotel_id");



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "unique_active_proposal_per_booking" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "unique_hotel_schedule" UNIQUE ("hotel_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "bookings_booking_id_idx" ON "public"."bookings" USING "btree" ("booking_id");



CREATE INDEX "idx_admins_email" ON "public"."admins" USING "btree" ("email");



CREATE INDEX "idx_admins_user_id" ON "public"."admins" USING "btree" ("user_id");



CREATE INDEX "idx_bookings_hotel_date" ON "public"."bookings" USING "btree" ("hotel_id", "booking_date");



CREATE INDEX "idx_bookings_payment_link_sent" ON "public"."bookings" USING "btree" ("payment_link_sent_at") WHERE ("payment_link_url" IS NOT NULL);



CREATE INDEX "idx_bookings_quote_token" ON "public"."bookings" USING "btree" ("quote_token") WHERE ("quote_token" IS NOT NULL);



CREATE INDEX "idx_bookings_trunk_id" ON "public"."bookings" USING "btree" ("trunk_id");



CREATE INDEX "idx_client_analytics_created_at" ON "public"."client_analytics" USING "btree" ("created_at");



CREATE INDEX "idx_client_analytics_event_name" ON "public"."client_analytics" USING "btree" ("event_name");



CREATE INDEX "idx_client_analytics_event_type" ON "public"."client_analytics" USING "btree" ("event_type");



CREATE INDEX "idx_client_analytics_hotel_created" ON "public"."client_analytics" USING "btree" ("hotel_id", "created_at");



CREATE INDEX "idx_client_analytics_hotel_id" ON "public"."client_analytics" USING "btree" ("hotel_id");



CREATE INDEX "idx_client_analytics_session_id" ON "public"."client_analytics" USING "btree" ("session_id");



CREATE INDEX "idx_hairdresser_payouts_booking_id" ON "public"."hairdresser_payouts" USING "btree" ("booking_id");



CREATE INDEX "idx_hairdresser_payouts_hairdresser_id" ON "public"."hairdresser_payouts" USING "btree" ("hairdresser_id");



CREATE INDEX "idx_hairdresser_payouts_status" ON "public"."hairdresser_payouts" USING "btree" ("status");



CREATE INDEX "idx_hairdresser_ratings_hairdresser_id" ON "public"."hairdresser_ratings" USING "btree" ("hairdresser_id");



CREATE INDEX "idx_hairdresser_ratings_token" ON "public"."hairdresser_ratings" USING "btree" ("rating_token");



CREATE INDEX "idx_hotel_ledger_booking_id" ON "public"."hotel_ledger" USING "btree" ("booking_id");



CREATE INDEX "idx_hotel_ledger_hotel_id" ON "public"."hotel_ledger" USING "btree" ("hotel_id");



CREATE INDEX "idx_hotel_ledger_status" ON "public"."hotel_ledger" USING "btree" ("status");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_otp_rate_limits_first_attempt" ON "public"."otp_rate_limits" USING "btree" ("first_attempt_at");



CREATE UNIQUE INDEX "idx_otp_rate_limits_phone_type" ON "public"."otp_rate_limits" USING "btree" ("phone_number", "request_type");



CREATE INDEX "idx_proposals_booking_id" ON "public"."booking_alternative_proposals" USING "btree" ("booking_id");



CREATE INDEX "idx_proposals_client_phone" ON "public"."booking_alternative_proposals" USING "btree" ("client_phone");



CREATE INDEX "idx_proposals_hairdresser_id" ON "public"."booking_alternative_proposals" USING "btree" ("hairdresser_id");



CREATE INDEX "idx_proposals_status" ON "public"."booking_alternative_proposals" USING "btree" ("status") WHERE ("status" <> ALL (ARRAY['slot1_accepted'::"text", 'slot2_accepted'::"text", 'all_rejected'::"text", 'expired'::"text"]));



CREATE INDEX "idx_push_notification_logs_booking_user" ON "public"."push_notification_logs" USING "btree" ("booking_id", "user_id");



CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_treatment_categories_hotel_id" ON "public"."treatment_categories" USING "btree" ("hotel_id");



CREATE INDEX "idx_venue_deployment_schedules_hotel_id" ON "public"."venue_deployment_schedules" USING "btree" ("hotel_id");



CREATE OR REPLACE TRIGGER "on_booking_cancelled" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_cancellation_notifications"();



CREATE OR REPLACE TRIGGER "sync_concierge_timezone" AFTER INSERT ON "public"."concierge_hotels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();



CREATE OR REPLACE TRIGGER "sync_hairdresser_timezone" AFTER INSERT ON "public"."hairdresser_hotels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();



CREATE OR REPLACE TRIGGER "trigger_treatment_categories_updated_at" BEFORE UPDATE ON "public"."treatment_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_treatment_categories_updated_at"();



CREATE OR REPLACE TRIGGER "update_admins_updated_at" BEFORE UPDATE ON "public"."admins" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_concierges_updated_at" BEFORE UPDATE ON "public"."concierges" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hairdresser_payouts_updated_at" BEFORE UPDATE ON "public"."hairdresser_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hairdressers_updated_at" BEFORE UPDATE ON "public"."hairdressers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hotel_ledger_updated_at" BEFORE UPDATE ON "public"."hotel_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_treatment_menus_updated_at" BEFORE UPDATE ON "public"."treatment_menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."hairdressers"("id");



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."hairdressers"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_trunk_id_fkey" FOREIGN KEY ("trunk_id") REFERENCES "public"."trunks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_analytics"
    ADD CONSTRAINT "client_analytics_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_concierge_id_fkey" FOREIGN KEY ("concierge_id") REFERENCES "public"."concierges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_hotels"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."hairdressers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_hotels"
    ADD CONSTRAINT "hairdresser_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_payouts"
    ADD CONSTRAINT "hairdresser_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_payouts"
    ADD CONSTRAINT "hairdresser_payouts_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."hairdressers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_ratings"
    ADD CONSTRAINT "hairdresser_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hairdresser_ratings"
    ADD CONSTRAINT "hairdresser_ratings_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."hairdressers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trunks"
    ADD CONSTRAINT "trunks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and concierge can read analytics" ON "public"."client_analytics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"]))))));



CREATE POLICY "Admins can create admins" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create booking treatments" ON "public"."booking_treatments" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create bookings" ON "public"."bookings" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create boxes" ON "public"."trunks" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create concierge hotels" ON "public"."concierge_hotels" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create concierges" ON "public"."concierges" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create hotels" ON "public"."hotels" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create treatment menus" ON "public"."treatment_menus" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete admins" ON "public"."admins" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete booking treatments" ON "public"."booking_treatments" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete bookings" ON "public"."bookings" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete boxes" ON "public"."trunks" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete concierge hotels" ON "public"."concierge_hotels" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete concierges" ON "public"."concierges" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete hairdressers" ON "public"."hairdressers" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete hotels" ON "public"."hotels" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete push notification logs" ON "public"."push_notification_logs" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete treatment menus" ON "public"."treatment_menus" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete venue deployment schedules" ON "public"."venue_deployment_schedules" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert hairdressers" ON "public"."hairdressers" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert push notification logs" ON "public"."push_notification_logs" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert venue deployment schedules" ON "public"."venue_deployment_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage categories" ON "public"."treatment_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "Admins can manage hairdresser hotels" ON "public"."hairdresser_hotels" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage ledger" ON "public"."hotel_ledger" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage payouts" ON "public"."hairdresser_payouts" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update admins" ON "public"."admins" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update bookings" ON "public"."bookings" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update boxes" ON "public"."trunks" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update concierge hotels" ON "public"."concierge_hotels" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update concierges" ON "public"."concierges" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update hairdressers" ON "public"."hairdressers" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update hotels" ON "public"."hotels" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update treatment menus" ON "public"."treatment_menus" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update venue deployment schedules" ON "public"."venue_deployment_schedules" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all booking treatments" ON "public"."booking_treatments" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all bookings" ON "public"."bookings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all boxes" ON "public"."trunks" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all concierge hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all concierges" ON "public"."concierges" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all hotels" ON "public"."hotels" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all ratings" ON "public"."hairdresser_ratings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all treatment menus" ON "public"."treatment_menus" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view hairdresser hotels" ON "public"."hairdresser_hotels" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view hairdressers" ON "public"."hairdressers" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view push notification logs" ON "public"."push_notification_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Allow anonymous inserts" ON "public"."client_analytics" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Block all user access to otp_rate_limits" ON "public"."otp_rate_limits" USING (false);



CREATE POLICY "Block anonymous access to admins" ON "public"."admins" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to bookings" ON "public"."bookings" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to concierges" ON "public"."concierges" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hairdresser_payouts" ON "public"."hairdresser_payouts" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hairdressers" ON "public"."hairdressers" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to hotel_ledger" ON "public"."hotel_ledger" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to notifications" ON "public"."notifications" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous access to profiles" ON "public"."profiles" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Block anonymous access to user_roles" ON "public"."user_roles" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Block anonymous select on hairdresser_ratings" ON "public"."hairdresser_ratings" AS RESTRICTIVE FOR SELECT TO "anon" USING (false);



CREATE POLICY "Concierges can create booking treatments for their hotels" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can create bookings for their hotels" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can delete booking treatments from their hotels" ON "public"."booking_treatments" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can delete bookings from their hotels" ON "public"."bookings" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can update bookings from their hotels" ON "public"."bookings" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can update their own profile" ON "public"."concierges" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Concierges can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));



CREATE POLICY "Concierges can view booking treatments from their hotels" ON "public"."booking_treatments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view boxes from their hotels" ON "public"."trunks" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view boxes from their hotels (read-only)" ON "public"."trunks" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view concierges from their hotels" ON "public"."concierges" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view hairdresser hotels from their hotels" ON "public"."hairdresser_hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));



CREATE POLICY "Concierges can view hairdressers from their hotels" ON "public"."hairdressers" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."hairdresser_id"
   FROM "public"."hairdresser_hotels" "hh"
  WHERE ("hh"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));



CREATE POLICY "Concierges can view hairdressers from their hotels (read-only)" ON "public"."hairdressers" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."hairdresser_id"
   FROM "public"."hairdresser_hotels" "hh"
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



CREATE POLICY "Hairdressers can create proposals" ON "public"."booking_alternative_proposals" FOR INSERT WITH CHECK (("hairdresser_id" IN ( SELECT "hairdressers"."id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can create their own profile" ON "public"."hairdressers" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can create treatments for pending bookings in thei" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = 'pending'::"text") AND ("b"."hairdresser_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "hh"."hotel_id"
           FROM "public"."hairdresser_hotels" "hh"
          WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))))));



CREATE POLICY "Hairdressers can delete their own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" IN ( SELECT "hairdressers"."user_id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can delete treatments for pending bookings in thei" ON "public"."booking_treatments" FOR DELETE USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = 'pending'::"text") AND ("b"."hairdresser_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "hh"."hotel_id"
           FROM "public"."hairdresser_hotels" "hh"
          WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))))));



CREATE POLICY "Hairdressers can update their own bookings" ON "public"."bookings" FOR UPDATE USING (("hairdresser_id" IN ( SELECT "hairdressers"."id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"())))) WITH CHECK ((("hairdresser_id" IS NULL) OR ("hairdresser_id" IN ( SELECT "hairdressers"."id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Hairdressers can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" IN ( SELECT "hairdressers"."user_id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"())))) WITH CHECK (("user_id" IN ( SELECT "hairdressers"."user_id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can update their own profile" ON "public"."hairdressers" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can view admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role"));



CREATE POLICY "Hairdressers can view concierge hotels from their hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role") AND ("hotel_id" IN ( SELECT "hh"."hotel_id"
   FROM "public"."hairdresser_hotels" "hh"
  WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))));



CREATE POLICY "Hairdressers can view concierges from their hotels" ON "public"."concierges" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "hh"."hotel_id"
           FROM "public"."hairdresser_hotels" "hh"
          WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))))));



CREATE POLICY "Hairdressers can view hotels from their bookings" ON "public"."hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role") AND ("id" IN ( SELECT DISTINCT "bookings"."hotel_id"
   FROM "public"."bookings"
  WHERE ("bookings"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))));



CREATE POLICY "Hairdressers can view pending bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role") AND ("status" = 'pending'::"text") AND ("hairdresser_id" IS NULL) AND ("hotel_id" IN ( SELECT "hh"."hotel_id"
   FROM "public"."hairdresser_hotels" "hh"
  WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"())))) AND (NOT ("public"."get_hairdresser_id"("auth"."uid"()) = ANY (COALESCE("declined_by", ARRAY[]::"uuid"[]))))));



CREATE POLICY "Hairdressers can view their own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("hairdresser_id" IN ( SELECT "hairdressers"."id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view their own hotel associations" ON "public"."hairdresser_hotels" FOR SELECT TO "authenticated" USING (("hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"())));



CREATE POLICY "Hairdressers can view their own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" IN ( SELECT "hairdressers"."user_id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view their own profile" ON "public"."hairdressers" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Hairdressers can view their own ratings" ON "public"."hairdresser_ratings" FOR SELECT USING (("hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"())));



CREATE POLICY "Hairdressers can view their payouts" ON "public"."hairdresser_payouts" FOR SELECT USING (("hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"())));



CREATE POLICY "Hairdressers can view their proposals" ON "public"."booking_alternative_proposals" FOR SELECT USING (("hairdresser_id" IN ( SELECT "hairdressers"."id"
   FROM "public"."hairdressers"
  WHERE ("hairdressers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Hairdressers can view treatment menus from their hotels" ON "public"."treatment_menus" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'hairdresser'::"public"."app_role") AND (("hotel_id" IN ( SELECT "hh"."hotel_id"
   FROM "public"."hairdresser_hotels" "hh"
  WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"())))) OR ("hotel_id" IS NULL))));



CREATE POLICY "Hairdressers can view treatments for pending bookings" ON "public"."booking_treatments" FOR SELECT USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = 'pending'::"text") AND ("b"."hairdresser_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "hh"."hotel_id"
           FROM "public"."hairdresser_hotels" "hh"
          WHERE ("hh"."hairdresser_id" = "public"."get_hairdresser_id"("auth"."uid"()))))))));



CREATE POLICY "Hairdressers can view treatments for their bookings" ON "public"."booking_treatments" FOR SELECT TO "authenticated" USING (("booking_id" IN ( SELECT "bookings"."id"
   FROM "public"."bookings"
  WHERE ("bookings"."hairdresser_id" IN ( SELECT "hairdressers"."id"
           FROM "public"."hairdressers"
          WHERE ("hairdressers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Public can insert ratings with valid token" ON "public"."hairdresser_ratings" FOR INSERT WITH CHECK (("rating_token" IS NOT NULL));



CREATE POLICY "Public can read categories" ON "public"."treatment_categories" FOR SELECT USING (true);



CREATE POLICY "Public can update ratings once with valid token" ON "public"."hairdresser_ratings" FOR UPDATE USING ((("rating_token" IS NOT NULL) AND ("submitted_at" IS NULL))) WITH CHECK (("rating_token" IS NOT NULL));



CREATE POLICY "Public can view venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Service role full access" ON "public"."booking_alternative_proposals" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "System can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "notifications"."user_id") AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'hairdresser'::"public"."app_role"]))))));



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



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_alternative_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_treatments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concierge_hotels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concierges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hairdresser_hotels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hairdresser_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hairdresser_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hairdressers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venue_deployment_schedules" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_last_name" "text", "_client_email" "text", "_room_number" "text", "_description" "text", "_treatment_id" "uuid", "_preferred_date" "date", "_preferred_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_funnel"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_concierge_hotels"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hotel_analytics_summary"("_hotel_id" "text", "_start_date" "date", "_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_hotel_by_id"("_hotel_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_hotels"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_treatments"("_hotel_id" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_venue_available_on_date"("_hotel_id" "text", "_check_date" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_timezone_from_hotel"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_treatment_request"("_client_first_name" "text", "_client_phone" "text", "_hotel_id" "text", "_client_email" "text", "_description" "text") TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "anon";
GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."booking_treatments" TO "anon";
GRANT ALL ON TABLE "public"."booking_treatments" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_treatments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."client_analytics" TO "anon";
GRANT ALL ON TABLE "public"."client_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."client_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."concierge_hotels" TO "anon";
GRANT ALL ON TABLE "public"."concierge_hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."concierge_hotels" TO "service_role";



GRANT ALL ON TABLE "public"."concierges" TO "anon";
GRANT ALL ON TABLE "public"."concierges" TO "authenticated";
GRANT ALL ON TABLE "public"."concierges" TO "service_role";



GRANT ALL ON TABLE "public"."hairdresser_hotels" TO "anon";
GRANT ALL ON TABLE "public"."hairdresser_hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."hairdresser_hotels" TO "service_role";



GRANT ALL ON TABLE "public"."hairdresser_payouts" TO "anon";
GRANT ALL ON TABLE "public"."hairdresser_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."hairdresser_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."hairdresser_ratings" TO "anon";
GRANT ALL ON TABLE "public"."hairdresser_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."hairdresser_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."hairdressers" TO "anon";
GRANT ALL ON TABLE "public"."hairdressers" TO "authenticated";
GRANT ALL ON TABLE "public"."hairdressers" TO "service_role";



GRANT ALL ON TABLE "public"."hotel_ledger" TO "anon";
GRANT ALL ON TABLE "public"."hotel_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."hotels" TO "anon";
GRANT ALL ON TABLE "public"."hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."hotels" TO "service_role";



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



GRANT ALL ON TABLE "public"."treatment_categories" TO "anon";
GRANT ALL ON TABLE "public"."treatment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_menus" TO "anon";
GRANT ALL ON TABLE "public"."treatment_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_menus" TO "service_role";



GRANT ALL ON TABLE "public"."trunks" TO "anon";
GRANT ALL ON TABLE "public"."trunks" TO "authenticated";
GRANT ALL ON TABLE "public"."trunks" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



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







