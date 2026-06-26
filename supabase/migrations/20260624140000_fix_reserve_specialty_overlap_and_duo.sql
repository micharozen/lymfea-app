-- Fix reserve_trunk_atomically:
-- 1. Duo bookings: reserve room only (therapist assignment via broadcast-accept).
-- 2. Specialty match: overlap (&&) like check-availability, not strict subset (<@).
-- 3. Duration 0 treated as 30 min for overlap calculations.

CREATE OR REPLACE FUNCTION public.reserve_trunk_atomically(
  _hotel_id text,
  _booking_date date,
  _booking_time time without time zone,
  _duration integer,
  _hotel_name text,
  _client_first_name text,
  _client_last_name text,
  _client_email text,
  _phone text,
  _room_number text,
  _client_note text,
  _status text,
  _payment_method text,
  _payment_status text,
  _total_price numeric,
  _language text,
  _treatment_ids text[],
  _customer_id text DEFAULT NULL,
  _therapist_gender text DEFAULT NULL,
  _stripe_session_id text DEFAULT NULL,
  _guest_count integer DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _room_id               UUID;
  _booking_id            UUID;
  _room                  RECORD;
  _new_start             INTEGER;
  _new_end               INTEGER;
  _effective_duration    INTEGER;
  _has_conflict          BOOLEAN;
  _required_specialties  TEXT[];
  _therapist_id          UUID := NULL;
  _therapist_skills      TEXT[];
  _travel_buffer         INTEGER;
  _turnover_buffer       INTEGER;
  _requested_dow         INTEGER;
  _treatment_record      RECORD;
  _is_duo                BOOLEAN;
BEGIN
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id      := NULLIF(NULLIF(NULLIF(_customer_id,     'undefined'), 'null'), '');
  _is_duo           := COALESCE(_guest_count, 1) > 1;
  _effective_duration := CASE WHEN COALESCE(_duration, 0) < 1 THEN 30 ELSE _duration END;

  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '10 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end   := _new_start + _effective_duration;

  SELECT COALESCE(inter_venue_buffer_minutes, 0),
         COALESCE(room_turnover_buffer_minutes, 0)
  INTO _travel_buffer, _turnover_buffer
  FROM hotels WHERE id::text = _hotel_id;

  _requested_dow := EXTRACT(DOW FROM _booking_date)::integer;

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

  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND treatment_type IS NOT NULL
      AND treatment_type != '';
  END IF;

  <<room_loop>>
  FOR _room IN
    SELECT id FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id
        AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '10 minutes')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30) + _turnover_buffer
             AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN CONTINUE room_loop; END IF;

    -- Duo: reserve the room only; therapists are assigned post-payment via broadcast-accept.
    IF _is_duo THEN
      _room_id := _room.id;
      _therapist_id := NULL;
      EXIT room_loop;
    END IF;

    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills
      FROM therapist_venues tv
      JOIN therapists t ON t.id = tv.therapist_id
      WHERE tv.hotel_id::text = _hotel_id
        AND LOWER(t.status) IN ('active', 'actif')
        AND (
          _therapist_gender IS NULL
          OR LOWER(t.gender) = LOWER(_therapist_gender)
        )
    LOOP
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
          IF NOT (_required_specialties && _therapist_skills) THEN CONTINUE; END IF;
        END IF;
      END IF;

      -- Therapist schedule: skip explicitly unavailable days
      IF EXISTS (
        SELECT 1 FROM therapist_availability ta
        WHERE ta.therapist_id = _therapist_id
          AND ta.date = _booking_date
          AND ta.is_available = false
      ) THEN
        CONTINUE;
      END IF;

      -- Therapist schedule: skip when shifts exist but booking time is outside all shifts
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
        _room_id := _room.id;
        EXIT room_loop;
      END IF;
    END LOOP;
  END LOOP;

  IF _room_id IS NULL THEN RAISE EXCEPTION 'NO_ROOM_AVAILABLE'; END IF;

  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, therapist_id, total_price, duration,
    room_number, customer_id, payment_method, payment_status, language, guest_count,
    therapist_gender_preference
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id,
    CASE WHEN _is_duo THEN NULL ELSE _therapist_id END,
    _total_price, _effective_duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language,
    COALESCE(_guest_count, 1),
    CASE WHEN NOT _is_duo THEN _therapist_gender ELSE NULL END
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;
