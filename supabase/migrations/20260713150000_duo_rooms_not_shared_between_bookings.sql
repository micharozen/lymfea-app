-- Multi-bed treatment rooms are for one multi-guest booking, not for sharing
-- between separate bookings. A room with capacity > 1 can host a duo/trio when
-- empty, but any overlapping booking in room_id or secondary_room_id makes the
-- room unavailable for another booking.

COMMENT ON COLUMN "public"."treatment_rooms"."capacity" IS
  'Nombre de clients pouvant etre accueillis ensemble dans une meme reservation (duo/trio). Une salle deja reservee ne peut pas etre partagee avec une autre reservation.';

CREATE OR REPLACE FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text" DEFAULT NULL::"text", "_therapist_gender" "text" DEFAULT NULL::"text", "_stripe_session_id" "text" DEFAULT NULL::"text", "_guest_count" integer DEFAULT 1) RETURNS "uuid"
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
  _required_specialties  TEXT[];
  _therapist_id          UUID := NULL;
  _solo_therapist_id     UUID := NULL;
  _therapist_skills      TEXT[];
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

  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    -- Add-ons are supplements, not soins: they must never impose a specialty on
    -- the therapist. They are performed by whoever performs the soin they extend.
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND COALESCE(is_addon, false) = false
      AND treatment_type IS NOT NULL
      AND treatment_type != '';
  END IF;

  -- Therapist availability is room-independent. A duo needs >= guest_count
  -- distinct practitioners free on this slot.
  _qualified_available := 0;
  FOR _therapist_id, _therapist_skills IN
    SELECT t.id, t.skills
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
    IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
      IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
        IF NOT _required_specialties <@ _therapist_skills THEN CONTINUE; END IF;
      END IF;
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

  -- Room allocation: an empty room contributes its whole capacity to one booking.
  -- Any overlapping booking in the room makes it unavailable for another booking.
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

  RETURN _booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."prevent_overlapping_treatment_room_bookings"() RETURNS trigger
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

  -- Serialize room checks per venue/day for direct admin inserts as well as RPC writes.
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

DROP TRIGGER IF EXISTS "trg_prevent_overlapping_treatment_room_bookings" ON "public"."bookings";
CREATE TRIGGER "trg_prevent_overlapping_treatment_room_bookings"
  BEFORE INSERT OR UPDATE OF hotel_id, booking_date, booking_time, duration, room_id, secondary_room_id, status, payment_status
  ON "public"."bookings"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_overlapping_treatment_room_bookings"();
