-- Add-ons no longer impose a required specialty on the therapist.
--
-- reserve_trunk_atomically aggregates _required_specialties over every _treatment_ids
-- entry and then keeps only therapists whose skills are a superset. Add-ons were part
-- of that aggregation, so a supplement typed e.g. 'relaxing_massage' hanging off a soin
-- with no treatment_type made the specialty mandatory. When no therapist qualified, the
-- room loop never ran and the RPC raised NO_ROOM_AVAILABLE — an error naming rooms for
-- a therapist-skills problem.
--
-- An add-on is performed by whoever performs the soin it extends (see accept_booking:
-- the first therapist to accept claims a leg = one base soin + its add-ons). It cannot
-- therefore constrain who is eligible.
--
-- Only the aggregation changes; the two-room allocation and the >= guest_count qualified
-- therapist check from 20260704130000 are carried over verbatim.

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
  _occupied_beds         INTEGER;
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

  -- Anti-race lock: block concurrent writes on same hotel+date
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

  -- Day-of-week constraint check per treatment
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
    -- Add-ons are supplements, not soins: they must never impose a specialty on the
    -- therapist. A 30-min "hot stones" add-on typed relaxing_massage would otherwise
    -- disqualify every practitioner whose skills don't list it, even though the base
    -- soin requires nothing — and the booking would fail as NO_ROOM_AVAILABLE.
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND COALESCE(is_addon, false) = false
      AND treatment_type IS NOT NULL
      AND treatment_type != '';
  END IF;

  -- ── Therapist availability (room-independent) ────────────────────────────────
  -- Count qualified + available therapists once. A duo needs >= guest_count distinct
  -- practitioners free on this slot; gender preference is ignored for duos. The single
  -- solo therapist id is captured for the solo insert (duo → NULL, assigned later).
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
      _qualified_available := _qualified_available + 1;
      IF _solo_therapist_id IS NULL THEN
        _solo_therapist_id := _therapist_id;
      END IF;
    END IF;
  END LOOP;

  IF _qualified_available < _guests THEN
    RAISE EXCEPTION 'NO_ROOM_AVAILABLE';
  END IF;

  -- ── Room allocation (greedy, up to 2 rooms) ──────────────────────────────────
  -- Fill a primary room up to its free capacity, overflow the remainder into a
  -- secondary room. Occupied beds count both room_id and secondary_room_id of
  -- overlapping bookings, using the shared attribution rule.
  _remaining := _guests;
  <<room_loop>>
  FOR _room IN
    SELECT id, capacity FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN b.room_id = _room.id
          THEN LEAST(COALESCE(b.guest_count, 1), COALESCE(rr_primary.capacity, 1))
        WHEN b.secondary_room_id = _room.id
          THEN COALESCE(b.guest_count, 1) - LEAST(COALESCE(b.guest_count, 1), COALESCE(rr_primary.capacity, 1))
        ELSE 0
      END
    ), 0) INTO _occupied_beds
    FROM bookings b
    LEFT JOIN treatment_rooms rr_primary ON rr_primary.id = b.room_id
    WHERE (b.room_id = _room.id OR b.secondary_room_id = _room.id)
      AND b.booking_date = _booking_date
      AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
      AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
      AND (_new_start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30) + _turnover_buffer
           AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)));

    _free := GREATEST(0, COALESCE(_room.capacity, 1) - _occupied_beds);
    IF _free <= 0 THEN CONTINUE room_loop; END IF;

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
    -- Only store gender preference for non-duo solo bookings
    CASE WHEN NOT _is_duo THEN _therapist_gender ELSE NULL END
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;
