-- Permet au thérapeute d'une réservation de consulter et modifier depuis la PWA
-- la (ou les) salle(s) de soin assignée(s).
--
-- Deux blocages RLS justifient des RPC SECURITY DEFINER :
--   1. `treatment_rooms` n'a aucune policy SELECT pour le rôle thérapeute — il ne
--      peut donc pas lister les salles du lieu ni afficher leur nom.
--   2. La policy UPDATE "Hairdressers can update their own bookings" ne couvre que
--      le thérapeute principal ; le 2e praticien d'un duo n'a qu'un SELECT.
--
-- Le trigger `prevent_overlapping_treatment_room_bookings` reste la garde atomique :
-- il lève ROOM_ALREADY_BOOKED si la salle vient d'être prise entre-temps.

-- Un utilisateur peut gérer les salles d'une réservation s'il est admin, concierge
-- du lieu, ou thérapeute rattaché à la réservation (principal ou via booking_therapists).
CREATE OR REPLACE FUNCTION "public"."can_manage_booking_rooms"(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.id = _booking_id
      AND (
        has_role(_user_id, 'admin'::app_role)
        OR (
          has_role(_user_id, 'concierge'::app_role)
          AND b.hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(_user_id))
        )
        OR b.therapist_id IN (SELECT t.id FROM therapists t WHERE t.user_id = _user_id)
        OR EXISTS (
          SELECT 1
          FROM booking_therapists bt
          JOIN therapists t ON t.id = bt.therapist_id
          WHERE bt.booking_id = b.id
            AND bt.status = 'accepted'
            AND t.user_id = _user_id
        )
      )
  );
$$;

ALTER FUNCTION "public"."can_manage_booking_rooms"(uuid, uuid) OWNER TO "postgres";

-- Salles actives du lieu de la réservation, avec leur occupation au créneau.
-- Même logique que le hook admin `useAvailableRooms` : la réservation courante est
-- exclue du calcul, un chevauchement réel bloque, un simple conflit de remise en
-- état (turnover) n'est qu'un avertissement.
CREATE OR REPLACE FUNCTION "public"."get_booking_room_options"(_booking_id uuid)
RETURNS TABLE(
  "id" uuid,
  "name" text,
  "room_number" text,
  "capacity" integer,
  "is_occupied" boolean,
  "turnover_conflict" boolean
)
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  _booking         bookings%ROWTYPE;
  _turnover_buffer INTEGER;
  _start           INTEGER;
  _end             INTEGER;
BEGIN
  IF NOT can_manage_booking_rooms(_booking_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO _booking FROM bookings WHERE bookings.id = _booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  SELECT COALESCE(h.room_turnover_buffer_minutes, 0)
  INTO _turnover_buffer
  FROM hotels h
  WHERE h.id = _booking.hotel_id;

  _start := EXTRACT(HOUR FROM _booking.booking_time) * 60 + EXTRACT(MINUTE FROM _booking.booking_time);
  _end   := _start + COALESCE(_booking.duration, 30);

  RETURN QUERY
  WITH conflicts AS (
    SELECT
      r.id AS room_id,
      -- Chevauchement réel (sans turnover) : bloquant.
      bool_or(
        _start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30)
        AND _end > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
      ) AS hard_conflict
    FROM treatment_rooms r
    JOIN bookings b
      ON b.hotel_id = _booking.hotel_id
     AND b.booking_date = _booking.booking_date
     AND b.id <> _booking.id
     AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
     AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
     AND (b.room_id = r.id OR b.secondary_room_id = r.id)
     -- Conflit turnover inclus : en dessous, ni blocage ni avertissement.
     AND _start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30) + _turnover_buffer
     AND _end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time))
    WHERE r.hotel_id = _booking.hotel_id
    GROUP BY r.id
  )
  SELECT
    r.id,
    r.name,
    r.room_number,
    GREATEST(COALESCE(r.capacity, 1), 1),
    COALESCE(c.hard_conflict, false),
    COALESCE(c.room_id IS NOT NULL AND NOT c.hard_conflict, false)
  FROM treatment_rooms r
  LEFT JOIN conflicts c ON c.room_id = r.id
  WHERE r.hotel_id = _booking.hotel_id
    AND LOWER(r.status) IN ('active', 'actif')
  ORDER BY r.name;
END;
$$;

ALTER FUNCTION "public"."get_booking_room_options"(uuid) OWNER TO "postgres";

-- Réassigne la salle principale et, pour un duo, la salle secondaire.
-- Retourne les identifiants effectivement enregistrés.
CREATE OR REPLACE FUNCTION "public"."set_booking_rooms"(
  _booking_id uuid,
  _room_id uuid,
  _secondary_room_id uuid DEFAULT NULL
)
RETURNS TABLE("new_room_id" uuid, "new_secondary_room_id" uuid)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  -- Héritage OOM : hotel_id est un text, pas un uuid.
  _hotel_id  text;
  _secondary uuid;
BEGIN
  IF NOT can_manage_booking_rooms(_booking_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT b.hotel_id INTO _hotel_id FROM bookings b WHERE b.id = _booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Une salle secondaire identique à la principale n'a pas de sens : on l'ignore.
  _secondary := CASE WHEN _secondary_room_id = _room_id THEN NULL ELSE _secondary_room_id END;

  IF _room_id IS NULL AND _secondary IS NOT NULL THEN
    RAISE EXCEPTION 'SECONDARY_ROOM_WITHOUT_PRIMARY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(array_remove(ARRAY[_room_id, _secondary], NULL::uuid)) AS wanted(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM treatment_rooms r
      WHERE r.id = wanted.id
        AND r.hotel_id = _hotel_id
        AND LOWER(r.status) IN ('active', 'actif')
    )
  ) THEN
    RAISE EXCEPTION 'ROOM_NOT_IN_VENUE';
  END IF;

  -- Le trigger prevent_overlapping_treatment_room_bookings lève ROOM_ALREADY_BOOKED
  -- si la salle a été prise entre-temps.
  RETURN QUERY
  UPDATE bookings b
  SET room_id = _room_id,
      secondary_room_id = _secondary
  WHERE b.id = _booking_id
  RETURNING b.room_id, b.secondary_room_id;
END;
$$;

ALTER FUNCTION "public"."set_booking_rooms"(uuid, uuid, uuid) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."can_manage_booking_rooms"(uuid, uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_booking_room_options"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_booking_rooms"(uuid, uuid, uuid) TO "authenticated";
