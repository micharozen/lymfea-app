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
  _required_categories TEXT[];
  _therapist_id UUID;
  _therapist_skills TEXT[];
BEGIN
  -- 1. NETTOYAGE RADICAL (Le fix pour Michael)
  IF _therapist_gender IN ('undefined', 'null', '') THEN _therapist_gender := NULL; END IF;
  IF _customer_id IN ('undefined', 'null', '') THEN _customer_id := NULL; END IF;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  -- 2. RÉCUPÉRATION DES CATÉGORIES REQUISES
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT LOWER(category)) INTO _required_categories
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids) AND category IS NOT NULL AND category != '';
  END IF;

  RAISE NOTICE '--- DEBUG : Début recherche pour % à % ---', _booking_date, _booking_time;
  RAISE NOTICE 'Catégories requises : %', _required_categories;

  -- 3. BOUCLE SALLES
  <<room_loop>>
  FOR _room IN
    SELECT id, name, room_number FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    -- Conflit Salle ?
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + duration
             AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN 
        RAISE NOTICE 'Salle % occupée', _room.name;
        CONTINUE room_loop; 
    END IF;

    -- 4. BOUCLE THÉRAPEUTES
    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND t.trunks LIKE '%' || _room.id::text || '%'
        AND (_therapist_gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      -- CHECK COMPÉTENCES STRICT (LOWER)
      IF _required_categories IS NOT NULL AND array_length(_required_categories, 1) > 0 THEN
        IF _therapist_skills IS NULL OR NOT (
          SELECT bool_and(req = ANY(SELECT LOWER(s) FROM unnest(_therapist_skills) s))
          FROM unnest(_required_categories) req
        ) THEN 
          RAISE NOTICE 'Thérapeute % rejeté : manque compétences (A: %, R: %)', _therapist_id, _therapist_skills, _required_categories;
          CONTINUE; 
        END IF;
      END IF;

      -- Conflit Thérapeute ?
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE therapist_id = _therapist_id AND booking_date = _booking_date
          AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + duration
               AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
      ) INTO _has_conflict;

      IF NOT _has_conflict THEN
        _room_id := _room.id;
        RAISE NOTICE 'Match trouvé ! Salle: %, Thérapeute: %', _room.name, _therapist_id;
        EXIT room_loop;
      ELSE
        RAISE NOTICE 'Thérapeute % occupé', _therapist_id;
      END IF;
    END LOOP;
  END LOOP;

  IF _room_id IS NULL THEN 
    RAISE NOTICE '--- ECHEC : AUCUN DUO DISPONIBLE ---';
    RAISE EXCEPTION 'NO_TRUNK_AVAILABLE'; 
  END IF;

  -- 5. INSERTION
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, therapist_id, total_price, duration, room_number, customer_id
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, _therapist_id, _total_price, _duration, 
    COALESCE(_room_number, _room.room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL AND _customer_id != '' THEN _customer_id::uuid ELSE NULL END
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;