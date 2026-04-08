-- Migration: Update RPC functions and trigger functions to use new Lymfea table names
-- All functions are recreated to reference therapists/therapist_venues instead of
-- hairdressers/hairdresser_hotels. Old function names are kept as wrappers for
-- backward compatibility with frontend code.

-- ============================================
-- 1. get_hairdresser_id → get_therapist_id
-- ============================================

-- New canonical function
CREATE OR REPLACE FUNCTION "public"."get_therapist_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.therapists WHERE user_id = _user_id LIMIT 1;
$$;

GRANT ALL ON FUNCTION "public"."get_therapist_id"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_therapist_id"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_therapist_id"("uuid") TO "service_role";

-- Backward-compatible wrapper (frontend still calls get_hairdresser_id)
CREATE OR REPLACE FUNCTION "public"."get_hairdresser_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.get_therapist_id(_user_id);
$$;

-- ============================================
-- 2. get_public_hairdressers → get_public_therapists
-- ============================================

-- New canonical function
CREATE OR REPLACE FUNCTION "public"."get_public_therapists"("_hotel_id" "text")
RETURNS TABLE("id" "text", "first_name" "text", "profile_image" "text", "skills" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.id, t.first_name, t.profile_image, t.skills
  FROM public.therapists t
  INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
  WHERE tv.hotel_id = _hotel_id AND t.status IN ('Active', 'Actif', 'active')
  ORDER BY t.first_name;
$$;

GRANT ALL ON FUNCTION "public"."get_public_therapists"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_therapists"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_therapists"("text") TO "service_role";

-- Backward-compatible wrapper
CREATE OR REPLACE FUNCTION "public"."get_public_hairdressers"("_hotel_id" "text")
RETURNS TABLE("id" "text", "first_name" "text", "profile_image" "text", "skills" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.get_public_therapists(_hotel_id);
$$;

-- ============================================
-- 3. accept_booking — update internal references
-- Keep parameter names for frontend compat (still passes _hairdresser_id etc.)
-- ============================================
CREATE OR REPLACE FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
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

-- ============================================
-- 4. unassign_booking — update internal references
-- ============================================
CREATE OR REPLACE FUNCTION "public"."unassign_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
  _current_declined_by uuid[];
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
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

-- ============================================
-- 5. handle_new_user — trigger function
-- Uses 'therapist' enum value and therapists table
-- ============================================
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

-- ============================================
-- 6. notify_hairdresser_on_assignment — trigger function
-- ============================================
CREATE OR REPLACE FUNCTION "public"."notify_hairdresser_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_user_id UUID;
BEGIN
  IF NEW.hairdresser_id IS NOT NULL AND
     (OLD.hairdresser_id IS NULL OR OLD.hairdresser_id != NEW.hairdresser_id) THEN

    SELECT user_id INTO therapist_user_id
    FROM public.therapists
    WHERE id = NEW.hairdresser_id;

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

-- ============================================
-- 7. notify_hairdresser_on_cancellation — trigger function
-- ============================================
CREATE OR REPLACE FUNCTION "public"."notify_hairdresser_on_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_user_id UUID;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.hairdresser_id IS NOT NULL THEN
    SELECT user_id INTO therapist_user_id
    FROM public.therapists
    WHERE id = NEW.hairdresser_id;

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

-- ============================================
-- 8. notify_hairdressers_new_booking — trigger function
-- ============================================
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

-- ============================================
-- 9. notify_hairdressers_on_unassignment — trigger function
-- ============================================
CREATE OR REPLACE FUNCTION "public"."notify_hairdressers_on_unassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  therapist_record RECORD;
BEGIN
  IF OLD.hairdresser_id IS NOT NULL AND
     NEW.hairdresser_id IS NULL AND
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

-- ============================================
-- 10. sync_profile_timezone_from_hotel — trigger function
-- After table rename, TG_TABLE_NAME is 'therapist_venues' (not 'hairdresser_hotels')
-- ============================================
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
