-- TOCTOU Fix: Atomic treatment room reservation with FOR UPDATE locking
-- Prevents double-booking race conditions by locking all active bookings for hotel+date
-- before checking room and therapist availability.
-- Ported from oom-app staging, adapted for Lymfea naming (treatment_rooms, therapists, room_id, therapist_id)

CREATE OR REPLACE FUNCTION reserve_trunk_atomically(
  _hotel_id TEXT,
  _booking_date DATE,
  _booking_time TIME,
  _duration INTEGER,
  _hotel_name TEXT,
  _client_first_name TEXT,
  _client_last_name TEXT,
  _client_email TEXT,
  _phone TEXT,
  _room_number TEXT,
  _client_note TEXT,
  _status TEXT,
  _payment_method TEXT,
  _payment_status TEXT,
  _total_price NUMERIC,
  _language TEXT,
  _treatment_ids TEXT[] DEFAULT NULL,
  _stripe_session_id TEXT DEFAULT NULL,
  _customer_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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
  _therapist_specialties TEXT[];
BEGIN
  -- Lock ALL active bookings for this hotel+date to prevent concurrent room assignment
  -- Excludes expired pre-reservations (awaiting_payment > 4 min) even if cron hasn't cleaned them yet
  PERFORM id FROM bookings
  WHERE hotel_id = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  -- Calculate requested time range in minutes
  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  -- Lookup required specialties from treatments (if treatment IDs provided)
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT category) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND category IS NOT NULL
      AND category != '';
  END IF;

  -- Find first available treatment room whose therapist is qualified and available
  FOR _room IN
    SELECT id FROM treatment_rooms
    WHERE hotel_id = _hotel_id AND status IN ('active', 'Actif')
    ORDER BY id
  LOOP
    -- Find the therapist who owns this room
    SELECT t.id, t.skills
    INTO _therapist_id, _therapist_specialties
    FROM therapists t
    WHERE t.status IN ('active', 'Active', 'Actif')
      AND _room.id::text = ANY(string_to_array(t.trunks, ', '))
    LIMIT 1;

    -- Skip room if no active therapist owns it
    IF _therapist_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Check therapist has ALL required specialties (categories)
    -- (therapist with no skills = qualifies for everything, backward compat)
    IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
      IF _therapist_specialties IS NOT NULL AND array_length(_therapist_specialties, 1) > 0 THEN
        IF NOT _required_specialties <@ _therapist_specialties THEN
          CONTINUE; -- therapist doesn't have all required specialties
        END IF;
      END IF;
    END IF;

    -- Check room time conflict
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE hotel_id = _hotel_id
        AND booking_date = _booking_date
        AND room_id = _room.id
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (
          _new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
          AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time))
        )
    ) INTO _has_conflict;

    IF _has_conflict THEN
      CONTINUE;
    END IF;

    -- Check therapist time conflict (across ALL their bookings, not just this room)
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE hotel_id = _hotel_id
        AND booking_date = _booking_date
        AND therapist_id = _therapist_id
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (
          _new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
          AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time))
        )
    ) INTO _has_conflict;

    IF _has_conflict THEN
      CONTINUE;
    END IF;

    _room_id := _room.id;
    EXIT;
  END LOOP;

  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'NO_TRUNK_AVAILABLE';
  END IF;

  -- Create booking atomically within the same locked transaction
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name,
    client_email, phone, room_number, client_note,
    booking_date, booking_time, status, room_id,
    payment_method, payment_status, total_price,
    duration, language, is_out_of_hours, surcharge_amount,
    stripe_invoice_url, customer_id
  ) VALUES (
    _hotel_id, _hotel_name, _client_first_name, _client_last_name,
    _client_email, _phone, _room_number, _client_note,
    _booking_date, _booking_time, _status, _room_id,
    _payment_method, _payment_status, _total_price,
    _duration, _language, false, 0,
    _stripe_session_id, _customer_id
  )
  RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;
