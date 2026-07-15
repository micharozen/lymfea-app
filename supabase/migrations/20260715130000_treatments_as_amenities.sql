-- ============================================================
-- Treatments réservables « amenity » : un treatment peut être relié à un
-- venue_amenity. Il s'affiche comme un soin sur le site client, mais sa
-- disponibilité dépend de la capacité de l'amenity (pas des salles/thérapeutes),
-- et sa réservation crée une ligne amenity_bookings liée au booking.
--
-- 1. treatment_menus.amenity_id (FK nullable → venue_amenities)
-- 2. get_public_treatments : expose amenity_id + amenity_type
-- 3. reserve_trunk_atomically : amenity-aware
--    - si TOUS les treatments sont des amenities → pas d'exigence salle/thérapeute
--    - vérifie atomiquement la capacité de chaque amenity (AMENITY_FULL)
--    - insère les lignes amenity_bookings liées (linked_booking_id) dans la même tx
-- ============================================================

-- 1. Colonne de liaison ------------------------------------------------------
ALTER TABLE public.treatment_menus
  ADD COLUMN IF NOT EXISTS amenity_id UUID REFERENCES public.venue_amenities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.treatment_menus.amenity_id IS
  'Si renseigné, ce treatment est un accès à un équipement (piscine, sauna...). '
  'Disponibilité = capacité du venue_amenity ; sa réservation crée un amenity_booking lié.';

CREATE INDEX IF NOT EXISTS idx_treatment_menus_amenity ON public.treatment_menus(amenity_id)
  WHERE amenity_id IS NOT NULL;

-- 2. RPC publique : exposer amenity_id + amenity_type ------------------------
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid, slug text, name text, name_en text,
  description text, description_en text,
  category text, service_for text,
  duration integer, price numeric, price_on_request boolean,
  lead_time integer, image text, sort_order integer,
  currency text, is_bestseller boolean, is_addon boolean,
  is_bundle boolean, bundle_id uuid,
  available_days integer[],
  amenity_id uuid, amenity_type text,
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id, t.slug, t.name, t.name_en,
    t.description, t.description_en,
    t.category, t.service_for,
    t.duration, t.price, t.price_on_request,
    t.lead_time, t.image, t.sort_order,
    t.currency, t.is_bestseller,
    (COALESCE(t.is_addon, false) OR COALESCE(tc.is_addon, false)) AS is_addon,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id,
    t.available_days,
    t.amenity_id,
    va.type AS amenity_type,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id, 'label', v.label, 'label_en', v.label_en,
          'duration', v.duration, 'price', v.price,
          'price_on_request', v.price_on_request,
          'is_default', v.is_default, 'sort_order', v.sort_order,
          'guest_count', v.guest_count
        ) ORDER BY v.sort_order, v.guest_count, v.duration
       )
       FROM public.treatment_variants v
       WHERE v.treatment_id = t.id AND v.status = 'active'),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  LEFT JOIN public.venue_amenities va
    ON va.id = t.amenity_id
  WHERE t.status = 'active' AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;

-- 3. reserve_trunk_atomically : amenity-aware -------------------------------
CREATE OR REPLACE FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text" DEFAULT NULL::"text", "_therapist_gender" "text" DEFAULT NULL::"text", "_stripe_session_id" "text" DEFAULT NULL::"text", "_guest_count" integer DEFAULT 1, "_amenity_timing" "text" DEFAULT 'same'::"text") RETURNS "uuid"
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
  _has_soin              BOOLEAN;
  _am                    RECORD;
  _am_occ                INTEGER;
  _am_start              TIME;
  _am_end                TIME;
  _soin_duration         INTEGER := 0;
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

  -- Un booking a besoin de salle/thérapeute uniquement s'il contient au moins un
  -- vrai soin (treatment sans amenity_id). Un booking 100% amenity ne consomme ni
  -- salle ni thérapeute : seule la capacité de l'amenity compte.
  _has_soin := EXISTS (
    SELECT 1 FROM treatment_menus
    WHERE id::text = ANY(_treatment_ids) AND amenity_id IS NULL
  );

  -- Durée cumulée des vrais soins (hors amenity) : sert de référence pour placer
  -- un accès amenity « après » le soin (_am_start = booking_time + durée soin).
  SELECT COALESCE(SUM(duration), 0)::INTEGER INTO _soin_duration
  FROM treatment_menus
  WHERE id::text = ANY(_treatment_ids) AND amenity_id IS NULL;

  -- ----- Capacité amenity : verrou + contrôle atomique (avant tout insert) -----
  -- Le verrou advisory est tenu jusqu'au COMMIT : aucune survente possible entre
  -- ce contrôle et l'insert des amenity_bookings plus bas.
  FOR _am IN
    SELECT tm.id AS treatment_id, tm.amenity_id, tm.duration AS am_duration,
           tm.price AS am_price, va.capacity_per_slot
    FROM treatment_menus tm
    JOIN venue_amenities va ON va.id = tm.amenity_id
    WHERE tm.id::text = ANY(_treatment_ids) AND tm.amenity_id IS NOT NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(_am.amenity_id::text || ':' || _booking_date::text));
    -- Placement de l'accès par rapport au soin (collé, sans trou) :
    --   before → l'accès se termine au début du soin ; after → l'accès démarre à
    --   la fin du soin ; same (défaut) → même horaire que le soin.
    _am_start := CASE _amenity_timing
      WHEN 'before' THEN (_booking_time - make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time
      WHEN 'after'  THEN (_booking_time + make_interval(mins => _soin_duration))::time
      ELSE _booking_time
    END;
    _am_end := (_am_start + make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time;
    SELECT COALESCE(SUM(num_guests), 0)::INTEGER INTO _am_occ
    FROM amenity_bookings
    WHERE venue_amenity_id = _am.amenity_id
      AND booking_date = _booking_date
      AND status NOT IN ('cancelled')
      AND booking_time < _am_end
      AND end_time > _am_start;
    IF _am_occ + _guests > _am.capacity_per_slot THEN
      RAISE EXCEPTION 'AMENITY_FULL';
    END IF;
  END LOOP;

  IF _has_soin THEN
    IF _treatment_ids IS NOT NULL AND array_length(_treatment_ids, 1) > 0 THEN
      -- Add-ons are supplements, not soins: they must never impose a specialty on
      -- the therapist. Amenities have no therapist either.
      SELECT array_agg(DISTINCT treatment_type) INTO _required_specialties
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
        AND COALESCE(is_addon, false) = false
        AND amenity_id IS NULL
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

  -- ----- Insert des amenity_bookings liés (capacité déjà verrouillée ci-dessus) -----
  FOR _am IN
    SELECT tm.amenity_id, tm.duration AS am_duration, tm.price AS am_price
    FROM treatment_menus tm
    WHERE tm.id::text = ANY(_treatment_ids) AND tm.amenity_id IS NOT NULL
  LOOP
    -- Même placement que dans le contrôle de capacité ci-dessus (before/after/same).
    _am_start := CASE _amenity_timing
      WHEN 'before' THEN (_booking_time - make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time
      WHEN 'after'  THEN (_booking_time + make_interval(mins => _soin_duration))::time
      ELSE _booking_time
    END;
    _am_end := (_am_start + make_interval(mins => COALESCE(_am.am_duration, _duration, 60)))::time;
    INSERT INTO amenity_bookings (
      hotel_id, venue_amenity_id, booking_date, booking_time, duration, end_time,
      customer_id, client_type, room_number, linked_booking_id, num_guests,
      price, payment_method, payment_status, status
    ) VALUES (
      _hotel_id, _am.amenity_id, _booking_date, _am_start,
      COALESCE(_am.am_duration, _duration, 60), _am_end,
      CASE WHEN _customer_id IS NOT NULL THEN _customer_id::uuid ELSE NULL END,
      'external',
      NULLIF(_room_number, 'TBD'),
      _booking_id,
      _guests,
      COALESCE(_am.am_price, 0),
      _payment_method,
      CASE WHEN _payment_status = 'card_saved' THEN 'pending' ELSE _payment_status END,
      'confirmed'
    );
  END LOOP;

  RETURN _booking_id;
END;
$$;
