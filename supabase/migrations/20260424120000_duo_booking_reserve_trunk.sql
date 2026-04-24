-- Duo booking support in reserve_trunk_atomically:
-- 1. Replace legacy trunks column lookup with therapist_venues junction table.
-- 2. Add _guest_count param: for multi-person bookings, reserve the room only
--    (therapist_id = NULL) so the broadcast-accept flow handles assignment
--    post-payment via accept_booking RPC + booking_therapists bridge table.

DO $$
DECLARE _s text;
BEGIN
  FOR _s IN (
    SELECT 'DROP FUNCTION public.reserve_trunk_atomically(' || pg_get_function_identity_arguments(oid) || ');'
    FROM pg_proc
    WHERE proname = 'reserve_trunk_atomically' AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE _s;
  END LOOP;
END $$;

CREATE FUNCTION public.reserve_trunk_atomically(
  _hotel_id         text,
  _booking_date     date,
  _booking_time     time without time zone,
  _duration         integer,
  _hotel_name       text,
  _client_first_name text,
  _client_last_name  text,
  _client_email      text,
  _phone             text,
  _room_number       text,
  _client_note       text,
  _status            text,
  _payment_method    text,
  _payment_status    text,
  _total_price       numeric,
  _language          text,
  _treatment_ids     text[],
  _customer_id       text    DEFAULT NULL,
  _therapist_gender  text    DEFAULT NULL,
  _stripe_session_id text    DEFAULT NULL,
  _guest_count       integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  _room_id           UUID;
  _booking_id        UUID;
  _room              RECORD;
  _new_start         INTEGER;
  _new_end           INTEGER;
  _has_conflict      BOOLEAN;
  _required_specialties TEXT[];
  _therapist_id      UUID := NULL;
  _therapist_skills  TEXT[];
  _travel_buffer     INTEGER;
  _turnover_buffer   INTEGER;
  _requested_dow     INTEGER;
  _treatment_record  RECORD;
  _is_duo            BOOLEAN;
BEGIN
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id      := NULLIF(NULLIF(NULLIF(_customer_id,     'undefined'), 'null'), '');
  _is_duo           := COALESCE(_guest_count, 1) > 1;

  -- Anti-race lock: block concurrent writes on same hotel+date
  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end   := _new_start + COALESCE(_duration, 30);

  SELECT COALESCE(inter_venue_buffer_minutes, 0),
         COALESCE(room_turnover_buffer_minutes, 0)
  INTO _travel_buffer, _turnover_buffer
  FROM hotels WHERE id::text = _hotel_id;

  -- Server-side day-of-week validation
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

  -- Required specialties from treatments
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND treatment_type IS NOT NULL AND treatment_type != '';
  END IF;

  <<room_loop>>
  FOR _room IN
    SELECT id, room_number FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    -- Room conflict check (with turnover buffer)
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id
        AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time))
                           + COALESCE(duration, 30) + _turnover_buffer
             AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;
    IF _has_conflict THEN CONTINUE room_loop; END IF;

    -- Duo booking: reserve the room only, therapist assignment happens via broadcast-accept
    IF _is_duo THEN
      _room_id      := _room.id;
      _therapist_id := NULL;
      EXIT room_loop;
    END IF;

    -- Solo: find a qualified, available therapist via therapist_venues (replaces legacy trunks column)
    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills
      FROM therapists t
      INNER JOIN therapist_venues tv ON tv.therapist_id = t.id AND tv.hotel_id::text = _hotel_id
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND (_therapist_gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      -- Skills check (no skills = qualified for everything — backward compat)
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
          IF NOT _required_specialties <@ _therapist_skills THEN CONTINUE; END IF;
        END IF;
      END IF;

      -- Therapist conflict check (cross-venue travel buffer aware)
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
  
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, therapist_id, total_price, duration,
    room_number, customer_id, payment_method, payment_status, language, guest_count
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, _therapist_id, _total_price, _duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language,
    COALESCE(_guest_count, 1)
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$func$;
