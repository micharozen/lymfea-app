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
    _customer_id text DEFAULT NULL::text,
    _therapist_gender text DEFAULT NULL::text,
    _stripe_session_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- Nettoyage des entrées "undefined" venant du JS
  IF _therapist_gender = 'undefined' OR _therapist_gender = 'null' THEN _therapist_gender := NULL; END IF;
  IF _customer_id = 'undefined' OR _customer_id = 'null' THEN _customer_id := NULL; END IF;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  RAISE NOTICE 'Tentative de réservation à % pour % min. Genre demandé: %', _booking_time, _duration, _therapist_gender;

  -- 1. Lock des bookings
  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  -- 2. Spécialités
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT LOWER(category)) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND category IS NOT NULL AND category != '';
  END IF;

  -- 3. Boucle Salles
  FOR _room IN
    SELECT id, name, room_number FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id 
      AND LOWER(status) IN ('active', 'active', 'actif')
    ORDER BY id
  LOOP
    RAISE NOTICE 'Vérification salle: %', _room.name;

    -- Conflit salle ?
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE hotel_id::text = _hotel_id
        AND booking_date = _booking_date
        AND room_id = _room.id
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
             AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN 
      RAISE NOTICE 'Salle % occupée.', _room.name;
      CONTINUE; 
    END IF;

    -- 4. Boucle Thérapeutes
    FOR _therapist_id, _therapist_specialties IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'active', 'actif')
        AND t.trunks LIKE '%' || _room.id::text || '%'
        AND (_therapist_gender IS NULL OR _therapist_gender = '' OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      -- Check spécialités
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_specialties IS NULL OR NOT (
          SELECT bool_and(req = ANY(SELECT LOWER(s) FROM unnest(_therapist_specialties) s))
          FROM unnest(_required_specialties) req
        ) THEN 
          RAISE NOTICE 'Thérapeute % n''a pas les compétences requises.', _therapist_id;
          CONTINUE; 
        END IF;
      END IF;

      -- Conflit thérapeute ?
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE hotel_id::text = _hotel_id
          AND booking_date = _booking_date
          AND therapist_id = _therapist_id
          AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
               AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
      ) INTO _has_conflict;

      IF NOT _has_conflict THEN
        _room_id := _room.id;
        -- On utilise le room_number de la salle trouvée si celui fourni est vide
        IF _room_number IS NULL OR _room_number = '' THEN _room_number := _room.room_number; END IF;
        
        RAISE NOTICE 'Match trouvé ! Salle: %, Thérapeute: %', _room.name, _therapist_id;
        EXIT; -- Sort du loop thérapeute
      END IF;
    END LOOP;

    IF _room_id IS NOT NULL THEN EXIT; END IF; -- Sort du loop salle
  END LOOP;

  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'NO_TRUNK_AVAILABLE';
  END IF;

  -- 5. Insertion
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name,
    client_email, phone, room_number, client_note,
    booking_date, booking_time, status, room_id, therapist_id,
    payment_method, payment_status, total_price,
    duration, language, is_out_of_hours, surcharge_amount,
    stripe_invoice_url, customer_id
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name,
    _client_email, _phone, _room_number, _client_note,
    _booking_date, _booking_time, _status, _room_id, _therapist_id,
    _payment_method, _payment_status, _total_price,
    _duration, _language, false, 0,
    _stripe_session_id, _customer_id::uuid
  )
  RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;