-- Retire `can_manage_booking_rooms` des RPC de salles de soin.
--
-- Ce garde-fou répondait à « cette réservation est-elle déjà la mienne ? » :
-- admin, concierge du lieu, thérapeute principal, ou thérapeute ayant accepté.
-- Il était appliqué aussi bien à la lecture qu'à l'écriture.
--
-- Sur la lecture, il entrait en conflit avec la RLS : la policy
-- « Therapists can view pending bookings from their hotels » ouvre la fiche à
-- tout thérapeute rattaché au lieu, alors que le garde-fou ne reconnaissait que
-- le titulaire. Ouvrir une réservation `pending` non encore acceptée depuis la
-- PWA levait donc systématiquement FORBIDDEN (le RPC fournit aussi les *noms*
-- de salles, `treatment_rooms` n'étant pas lisible par le rôle thérapeute).
--
-- Sur l'écriture, modifier la salle est un droit du thérapeute, et la fonction
-- valide déjà que la salle appartient au lieu de la réservation
-- (ROOM_NOT_IN_VENUE) ; le trigger `prevent_overlapping_treatment_room_bookings`
-- reste la garde atomique contre le double-booking.

-- Lecture : salles actives du lieu de la réservation, avec leur occupation au
-- créneau. Corps inchangé, seul le contrôle d'accès en tête est retiré.
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

-- Écriture : réassigne la salle principale et, pour un duo, la salle secondaire.
-- Corps inchangé, seul le contrôle d'accès en tête est retiré.
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

-- Plus aucun appelant : la fonction disparaît plutôt que de rester en place sans usage.
DROP FUNCTION IF EXISTS "public"."can_manage_booking_rooms"(uuid, uuid);
