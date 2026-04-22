-- ==============================================================================
-- Migration : fix_gender_preference
-- Description :
--   1. Ajoute la colonne preferred_therapist_gender sur bookings pour stocker
--      la préférence de genre du client à la création.
--   2. Corrige reserve_trunk_atomically : un thérapeute sans genre (NULL)
--      est éligible pour toutes les préférences (comportement attendu).
--   3. Corrige accept_booking : un thérapeute du mauvais genre ne peut pas
--      accepter une réservation, SAUF si tous les thérapeutes du bon genre
--      affiliés au lieu ont déjà décliné (fallback).
-- ==============================================================================

-- 1. Colonne preferred_therapist_gender sur bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS preferred_therapist_gender text
  CHECK (preferred_therapist_gender IS NULL OR preferred_therapist_gender = ANY (ARRAY['female', 'male']));

-- 2. Mise à jour de reserve_trunk_atomically : NULL gender = éligible pour tout
DO $$
DECLARE _drop_stmt text;
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
  _turnover_buffer INTEGER;
  _requested_dow INTEGER;
  _treatment_record RECORD;
BEGIN
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id := NULLIF(NULLIF(NULLIF(_customer_id, 'undefined'), 'null'), '');

  PERFORM id FROM bookings
  WHERE hotel_id::text = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  SELECT COALESCE(inter_venue_buffer_minutes, 0),
         COALESCE(room_turnover_buffer_minutes, 0)
  INTO _travel_buffer, _turnover_buffer
  FROM hotels WHERE id::text = _hotel_id;

  -- Validation des jours disponibles
  _requested_dow := EXTRACT(DOW FROM _booking_date)::integer;

  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    FOR _treatment_record IN
      SELECT name, available_days
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
    LOOP
      IF _treatment_record.available_days IS NOT NULL
         AND array_length(_treatment_record.available_days, 1) > 0
         AND NOT _requested_dow = ANY(_treatment_record.available_days)
      THEN
        RAISE EXCEPTION 'DAY_CONSTRAINT_VIOLATION: Le soin "%" n''est pas disponible ce jour-là.', _treatment_record.name;
      END IF;
    END LOOP;
  END IF;

  -- Extraction des spécialités requises
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
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE room_id = _room.id
        AND booking_date = _booking_date
        AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
        AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30) + _turnover_buffer
             AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN CONTINUE room_loop; END IF;

    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND _room.id::text = ANY(string_to_array(t.trunks, ', '))
        -- FIX: thérapeute sans genre (NULL) éligible pour toutes les préférences
        AND (_therapist_gender IS NULL OR t.gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_skills IS NOT NULL AND array_length(_therapist_skills, 1) > 0 THEN
          IF NOT _required_specialties <@ _therapist_skills THEN
            CONTINUE;
          END IF;
        END IF;
      END IF;

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
    room_number, customer_id, payment_method, payment_status, language,
    preferred_therapist_gender
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, _therapist_id, _total_price, _duration,
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method,
    CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
    _language,
    _therapist_gender
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$func$;

-- 3. Mise à jour de accept_booking : vérification du genre avec fallback
CREATE OR REPLACE FUNCTION "public"."accept_booking"(
  "_booking_id" "uuid",
  "_hairdresser_id" "uuid",
  "_hairdresser_name" "text",
  "_total_price" numeric
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _current_therapist_id uuid;
  _booking_guest_count integer;
  _accepted_count integer;
  _new_status text;
  _booking_hotel_id text;
  _preferred_gender text;
  _therapist_gender text;
  _preferred_gender_all_declined boolean;
BEGIN
  -- Vérification : l'appelant est bien propriétaire du profil thérapeute
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Verrouillage + récupération des infos de la réservation
  SELECT therapist_id, guest_count, hotel_id, preferred_therapist_gender
  INTO _current_therapist_id, _booking_guest_count, _booking_hotel_id, _preferred_gender
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  _booking_guest_count := COALESCE(_booking_guest_count, 1);

  -- Vérification du genre du thérapeute vs préférence client
  -- Règle : si le client a une préférence ET le thérapeute a un genre configuré
  -- ET il ne correspond pas → refus, SAUF si tous les thérapeutes du bon genre
  -- affiliés à ce lieu ont déjà décliné (fallback).
  IF _preferred_gender IS NOT NULL THEN
    SELECT gender INTO _therapist_gender
    FROM therapists WHERE id = _hairdresser_id;

    IF _therapist_gender IS NOT NULL AND LOWER(_therapist_gender) != LOWER(_preferred_gender) THEN
      -- Vérifier si tous les thérapeutes du genre préféré ont décliné
      SELECT NOT EXISTS (
        SELECT 1
        FROM therapist_venues tv
        JOIN therapists t ON t.id = tv.therapist_id
        WHERE tv.hotel_id = _booking_hotel_id
          AND LOWER(t.gender) = LOWER(_preferred_gender)
          AND LOWER(t.status) IN ('active', 'actif')
          AND NOT (t.id = ANY(
            SELECT unnest(declined_by) FROM bookings WHERE id = _booking_id
          ))
      ) INTO _preferred_gender_all_declined;

      IF NOT _preferred_gender_all_declined THEN
        RETURN jsonb_build_object('success', false, 'error', 'gender_mismatch');
      END IF;
    END IF;
  END IF;

  -- Backward compat : réservation solo déjà prise par un autre
  IF _booking_guest_count = 1 THEN
    IF _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_taken');
    END IF;
  END IF;

  -- Déjà accepté par ce thérapeute
  IF EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id AND therapist_id = _hairdresser_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  -- Équipe déjà complète
  SELECT COUNT(*) INTO _accepted_count
  FROM booking_therapists
  WHERE booking_id = _booking_id AND status = 'accepted';

  IF _accepted_count >= _booking_guest_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'fully_staffed');
  END IF;

  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now());

  _accepted_count := _accepted_count + 1;

  IF _accepted_count >= _booking_guest_count THEN
    _new_status := 'confirmed';
  ELSE
    _new_status := 'awaiting_hairdresser_selection';
  END IF;

  UPDATE bookings
  SET
    therapist_id = COALESCE(therapist_id, _hairdresser_id),
    therapist_name = COALESCE(therapist_name, _hairdresser_name),
    status = _new_status,
    assigned_at = CASE WHEN _new_status = 'confirmed' THEN now() ELSE assigned_at END,
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'therapist_id', therapist_id,
    'status', status,
    'guest_count', guest_count,
    'accepted_therapists', _accepted_count
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;
