-- ==============================================================================
-- Migration : fix_therapist_specialty_match
-- Description :
--   1) Corrige l'algo reserve_trunk_atomically pour comparer les compétences du
--      thérapeute à treatment_menus.treatment_type (enum applicatif SPECIALTY_OPTIONS)
--      au lieu de treatment_menus.category (texte libre par venue, utilisé uniquement
--      pour le regroupement des soins dans le parcours de réservation client).
--   2) Backfill treatment_type à partir des libellés FR connus quand il est NULL.
--   3) Normalise therapists.skills : remplace les libellés FR historiques par les
--      clés enum correspondantes pour qu'ils matchent treatment_type.
-- ==============================================================================

-- 1. Backfill treatment_menus.treatment_type depuis les libellés FR connus
UPDATE public.treatment_menus
SET treatment_type = 'body_treatment'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('soin du corps', 'soins corps', 'soin corps');

UPDATE public.treatment_menus
SET treatment_type = 'facial'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('soin du visage', 'soins visage', 'soin visage', 'facial');

UPDATE public.treatment_menus
SET treatment_type = 'body_wrap'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('enveloppement', 'body wrap');

UPDATE public.treatment_menus
SET treatment_type = 'body_scrub'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('gommage', 'gommage corporel', 'body scrub');

UPDATE public.treatment_menus
SET treatment_type = 'manicure_pedicure'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('manucure', 'pédicure', 'manucure & pédicure', 'manicure', 'pedicure');

UPDATE public.treatment_menus
SET treatment_type = 'hair_removal'
WHERE treatment_type IS NULL
  AND LOWER(TRIM(category)) IN ('épilation', 'epilation', 'hair removal');

-- 2. Normalisation therapists.skills : FR → clés enum
UPDATE public.therapists SET skills = array_replace(skills, 'Soin du corps', 'body_treatment');
UPDATE public.therapists SET skills = array_replace(skills, 'Soin du visage', 'facial');
UPDATE public.therapists SET skills = array_replace(skills, 'Enveloppement', 'body_wrap');
UPDATE public.therapists SET skills = array_replace(skills, 'Gommage corporel', 'body_scrub');
UPDATE public.therapists SET skills = array_replace(skills, 'Manucure & Pédicure', 'manicure_pedicure');
UPDATE public.therapists SET skills = array_replace(skills, 'Épilation', 'hair_removal');
UPDATE public.therapists SET skills = array_replace(skills, 'Massage relaxant', 'relaxing_massage');
UPDATE public.therapists SET skills = array_replace(skills, 'Massage deep tissue', 'deep_tissue');
UPDATE public.therapists SET skills = array_replace(skills, 'Massage pierres chaudes', 'hot_stones');
UPDATE public.therapists SET skills = array_replace(skills, 'Aromathérapie', 'aromatherapy');
UPDATE public.therapists SET skills = array_replace(skills, 'Massage prénatal', 'prenatal_massage');
UPDATE public.therapists SET skills = array_replace(skills, 'Massage sportif', 'sports_massage');
UPDATE public.therapists SET skills = array_replace(skills, 'Hydrothérapie', 'hydrotherapy');
UPDATE public.therapists SET skills = array_replace(skills, 'Réflexologie', 'reflexology');
UPDATE public.therapists SET skills = array_replace(skills, 'Ayurvéda', 'ayurveda');

-- 3. Recréation de reserve_trunk_atomically : compare treatment_type au lieu de category
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
  PERFORM id FROM bookings
  WHERE hotel_id = _hotel_id
    AND booking_date = _booking_date
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  -- Lookup required specialties from treatment_menus.treatment_type (enum applicatif)
  -- category n'est PAS utilisé ici : c'est un libellé d'affichage côté client flow.
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
    WHERE hotel_id = _hotel_id AND status IN ('active', 'Actif')
    ORDER BY id
  LOOP
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
      CONTINUE room_loop;
    END IF;

    FOR _therapist_id, _therapist_specialties IN
      SELECT t.id, t.skills
      FROM therapists t
      WHERE t.status IN ('active', 'Active', 'Actif')
        AND _room.id::text = ANY(string_to_array(t.trunks, ', '))
    LOOP
      -- Check therapist has ALL required specialties (treatment_type keys)
      -- Fallback : thérapeute sans skills défini = qualifie pour tout (backward compat)
      IF _required_specialties IS NOT NULL AND array_length(_required_specialties, 1) > 0 THEN
        IF _therapist_specialties IS NOT NULL AND array_length(_therapist_specialties, 1) > 0 THEN
          IF NOT _required_specialties <@ _therapist_specialties THEN
            CONTINUE;
          END IF;
        END IF;
      END IF;

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

      IF NOT _has_conflict THEN
        _room_id := _room.id;
        EXIT room_loop;
      END IF;
    END LOOP;
  END LOOP;

  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'NO_TRUNK_AVAILABLE';
  END IF;

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
