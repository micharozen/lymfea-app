-- ==============================================================================
-- Migration : secure_atomic_booking_function
-- Description : Refonte de la fonction de réservation atomique (RPC).
-- Objectifs :
--   1. Sécurité : Nettoyage des inputs front-end (nullification des 'undefined').
--   2. Robustesse : Forçage des types (cast ::uuid) pour éviter les erreurs 500.
--   3. Métier : Assouplissement du matching des compétences (insensible à la casse 
--      et aux espaces invisibles via TRIM et LOWER) pour éviter les faux positifs (409).
-- ==============================================================================

-- 1. SÉCURITÉ : On s'assure que les colonnes nécessaires existent dans la table bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS language text DEFAULT 'fr';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stripe_invoice_url text;

-- 2. NETTOYAGE DYNAMIQUE (ANTI-OVERLOADING)
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
-- ==============================================================================
-- ÉTAPE 2 : NOUVELLE CRÉATION PROPRE DE LA FONCTION
-- ==============================================================================
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
  -- 1. Nettoyage des données parasites envoyées par le client (ex: "undefined" en string)
  _therapist_gender := NULLIF(NULLIF(NULLIF(_therapist_gender, 'undefined'), 'null'), '');
  _customer_id := NULLIF(NULLIF(NULLIF(_customer_id, 'undefined'), 'null'), '');

  _new_start := EXTRACT(HOUR FROM _booking_time) * 60 + EXTRACT(MINUTE FROM _booking_time);
  _new_end := _new_start + COALESCE(_duration, 30);

  -- 2. Extraction des catégories de soins requises, avec formatage strict (minuscules, sans espaces)
  IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT TRIM(LOWER(category))) INTO _required_categories
    FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids) AND category IS NOT NULL AND TRIM(category) != '';
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
        AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
             AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
    ) INTO _has_conflict;

    IF _has_conflict THEN CONTINUE room_loop; END IF;

    -- 4. Recherche d'un thérapeute qualifié et disponible pour cette salle
    FOR _therapist_id, _therapist_skills IN
      SELECT t.id, t.skills FROM therapists t
      WHERE LOWER(t.status) IN ('active', 'actif')
        AND t.trunks LIKE '%' || _room.id::text || '%'
        AND (_therapist_gender IS NULL OR LOWER(t.gender) = LOWER(_therapist_gender))
    LOOP
      -- 4a. Matching intelligent des compétences (tolère les variations de saisie Front/Back)
      IF _required_categories IS NOT NULL AND array_length(_required_categories, 1) > 0 THEN
        IF _therapist_skills IS NULL OR NOT (
          SELECT bool_and(
            EXISTS (
              SELECT 1 FROM unnest(_therapist_skills) s
              WHERE TRIM(LOWER(s)) = req
                 OR TRIM(LOWER(s)) LIKE '%' || req || '%'
                 OR req LIKE '%' || TRIM(LOWER(s)) || '%'
            )
          )
          FROM unnest(_required_categories) req
        ) THEN 
          CONTINUE; -- Le thérapeute n'a pas la compétence requise
        END IF;
      END IF;

      -- 4b. Vérification de la disponibilité du thérapeute
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE therapist_id = _therapist_id 
          AND booking_date = _booking_date
          AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
          AND (_new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
               AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)))
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
    room_number, customer_id, payment_method, payment_status, stripe_invoice_url, language
  ) VALUES (
    _hotel_id::uuid, _hotel_name, _client_first_name, _client_last_name, _client_email, _phone,
    _booking_date, _booking_time, _status, _room_id, _therapist_id, _total_price, _duration, 
    COALESCE(_room_number, 'TBD'),
    CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
    _payment_method, _payment_status, _stripe_session_id, _language
  ) RETURNING id INTO _booking_id;

  RETURN _booking_id;
END;
$$;