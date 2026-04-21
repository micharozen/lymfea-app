-- ==============================================================================
-- Migration : add_inter_venue_buffer
-- Description : Ajoute un buffer de trajet inter-lieux pour les thérapeutes
--   multi-venues. Un thérapeute finissant une prestation dans un lieu A ne peut
--   pas être booké immédiatement dans un lieu B — il faut un temps de trajet.
-- ==============================================================================

-- 1. Nouveau champ sur hotels : buffer en minutes (0 = pas de buffer)
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS inter_venue_buffer_minutes INTEGER DEFAULT 0;

-- 2. Recréation de reserve_trunk_atomically() avec buffer inter-venue
DO $$
DECLARE
    _drop_stmt text;
BEGIN
    FOR _drop_stmt IN (
        SELECT 'DROP FUNCTION public.reserve_trunk_atomically(' || pg_get_function_identity_arguments(oid) || ');'
        FROM pg_proc
        WHERE proname = 'reserve_trunk_atomically' AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE _drop_stmt;
    END LOOP;
END $$;

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
AS $func$
DECLARE
  _room_id UUID;
  _booking_id UUID;
  _room RECORD;
  _new_start INTEGER;
  _new_end INTEGER;
  _has_conflict BOOLEAN;
  _required_specialties TEXT[];
  _therapist_id UUID;
  _therapist_skills TEXT[];
  _travel_buffer INTEGER;
BEGIN
  -- 1. Nettoyage des données parasites envoyées par le client (ex: "undefined" en string)
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id := NULLIF(NULLIF(NULLIF(_customer_id, 'undefined'), 'null'), '');

  -- Verrou anti-race condition : bloque les lignes de bookings concernées
  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  -- Récupérer le buffer inter-venue du lieu courant
  SELECT COALESCE(inter_venue_buffer_minutes, 0) INTO _travel_buffer
  FROM hotels WHERE id::text = _hotel_id;

  -- 2. Extraction des spécialités requises via treatment_type (enum applicatif)
  --    category n'est PAS utilisé ici : c'est un libellé d'affichage côté client flow.
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids)
      AND treatment_type IS NOT NULL
      AND treatment_type != '';
  END IF;

  <<room_loop>>
  FOR _room IN
    SELECT id, room_number FROM treatment_rooms
    WHERE hotel_id::text = _hotel_id AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    -- 3. Vérification de la disponibilité de la salle
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id
        AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
             AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN CONTINUE room_loop; END IF;

    -- 4. Recherche d'un thérapeute qualifié et disponible pour cette salle
    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND _room.id::text = ANY(string_to_array(t.trunks, ', '))
        AND (_therapist_gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      -- 4a. Check therapist has ALL required specialties (treatment_type keys)
      -- Fallback : thérapeute sans skills défini = qualifie pour tout (backward compat)
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
          IF NOT _required_specialties <@ _therapist_skills THEN
            CONTINUE;
          END IF;
        END IF;
      END IF;

      -- 4b. Vérification de la disponibilité du thérapeute (avec buffer inter-venue)
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
                                 ELSE 0 END
            AND
            _new_end > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
                        - CASE WHEN b.hotel_id::text != _hotel_id
                               THEN GREATEST(_travel_buffer, COALESCE(h.inter_venue_buffer_minutes, 0))
                               ELSE 0 END
          )
      ) INTO _has_conflict;

      IF NOT _has_conflict THEN
        _room_id := _room.id;
        EXIT room_loop; -- Un duo Salle/Thérapeute valide a été trouvé
      END IF;
    END LOOP;
  END LOOP;

  -- 5. Rejet si aucun duo n'est disponible (renverra une erreur 409 côté client)
  IF _room_id IS NULL THEN RAISE EXCEPTION 'NO_TRUNK_AVAILABLE'; END IF;

  -- 6. Insertion finale avec Cast explicite pour la sécurité
  INSERT INTO bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone,
    booking_date, booking_time, status, room_id, therapist_id, total_price, duration,
    room_number, customer_id, payment_method, payment_status, language
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, _therapist_id, _total_price, _duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$func$;
