-- Migration: Rename hairdresser columns in bookings and hotels to Lymfea naming
-- Also update RPC functions and triggers that reference these column names directly.

-- ============================================
-- 1. Rename columns in bookings
-- ============================================
ALTER TABLE bookings RENAME COLUMN hairdresser_id TO therapist_id;
ALTER TABLE bookings RENAME COLUMN hairdresser_name TO therapist_name;

-- ============================================
-- 2. Rename column in hotels
-- ============================================
ALTER TABLE hotels RENAME COLUMN hairdresser_commission TO therapist_commission;

-- ============================================
-- 3. Update accept_booking — use new column names
-- Parameters kept with old names for frontend compatibility
-- ============================================
CREATE OR REPLACE FUNCTION "public"."accept_booking"("_booking_id" "uuid", "_hairdresser_id" "uuid", "_hairdresser_name" "text", "_total_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_therapist_id uuid;
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT therapist_id INTO _current_therapist_id
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  UPDATE bookings
  SET
    therapist_id = _hairdresser_id,
    therapist_name = _hairdresser_name,
    status = 'confirmed',
    assigned_at = now(),
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'therapist_id', therapist_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;

-- ============================================
-- 4. Update unassign_booking — use new column names
-- ============================================
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

-- ============================================
-- 5. Update notify_hairdresser_on_assignment trigger
-- ============================================
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

-- ============================================
-- 6. Update notify_hairdresser_on_cancellation trigger
-- ============================================
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

-- ============================================
-- 7. Update notify_hairdressers_new_booking trigger (no column change needed, already uses therapist tables)
-- ============================================
-- No change needed — this trigger already uses therapists/therapist_venues tables (from migration 00003)
-- and does not reference hairdresser_id/hairdresser_name columns on bookings.

-- ============================================
-- 8. Update notify_hairdressers_on_unassignment trigger
-- ============================================
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
