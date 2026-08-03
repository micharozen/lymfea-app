-- ============================================================
-- Blocage ponctuel DATÉ de créneaux, ciblable sur une salle de soin.
--
-- Besoin : neutraliser une plage horaire (shooting photo, maintenance,
-- fermeture exceptionnelle) sans créer de booking fantôme. Jusqu'ici
-- venue_blocked_slots ne savait exprimer qu'un récurrent hebdomadaire au
-- niveau du lieu — inutilisable pour « le 12/08 de 8h à 12h, salle A ».
--
-- Extension de la table existante plutôt que table dédiée : un seul point
-- d'application dans le moteur de dispo, une seule UI, et le blocage ponctuel
-- du lieu entier arrive gratuitement.
--
--   block_date NULL      → récurrent hebdomadaire (days_of_week fait foi)
--   block_date renseigné → blocage ponctuel sur cette date (days_of_week ignoré)
--   room_id NULL         → tout le lieu ; renseigné → cette salle uniquement
--   group_id             → regroupe une création multi-salles / multi-jours
--
-- Une plage multi-jours = N lignes (salle × jour) partageant un group_id : le
-- moteur ne voit que des plages intra-journée, aucun découpage dans le chemin
-- critique. start_time/end_time restent en heure locale du lieu, comme
-- bookings.booking_time.
--
-- 1. Colonnes + contraintes + index
-- 2. reserve_trunk_atomically : garde-fou atomique (la table n'y était pas lue)
-- ============================================================

-- 1. Colonnes ----------------------------------------------------------------
ALTER TABLE public.venue_blocked_slots
  ADD COLUMN IF NOT EXISTS block_date date,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.treatment_rooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_id uuid;

COMMENT ON COLUMN public.venue_blocked_slots.block_date IS
  'NULL = blocage récurrent hebdomadaire (days_of_week fait foi). Renseigné = blocage ponctuel sur cette date locale du lieu, days_of_week ignoré. Tout lecteur doit filtrer explicitement sur cette colonne.';

COMMENT ON COLUMN public.venue_blocked_slots.room_id IS
  'NULL = le blocage porte sur tout le lieu. Renseigné = il ne porte que sur cette salle de soin, les autres restent réservables.';

COMMENT ON COLUMN public.venue_blocked_slots.group_id IS
  'Regroupe les lignes créées ensemble (multi-salles et/ou multi-jours) pour un affichage et une suppression en bloc côté admin.';

ALTER TABLE public.venue_blocked_slots
  DROP CONSTRAINT IF EXISTS blocked_slot_dated_xor_recurring;

ALTER TABLE public.venue_blocked_slots
  ADD CONSTRAINT blocked_slot_dated_xor_recurring
  CHECK (block_date IS NULL OR days_of_week IS NULL);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_hotel_date
  ON public.venue_blocked_slots (hotel_id, block_date)
  WHERE block_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blocked_slots_group
  ON public.venue_blocked_slots (group_id)
  WHERE group_id IS NOT NULL;

-- Les policies RLS existantes (admin manage, concierge select, service_role)
-- couvrent la table : rien à ajouter ici.

-- 2. reserve_trunk_atomically ------------------------------------------------
-- Repris intégralement de 20260722120000_variant_available_days.sql (version
-- courante ; 80_functions.sql est en retard sur cette fonction, ne pas s'en
-- servir de base). Signature inchangée → CREATE OR REPLACE suffit, pas de DROP.
-- Seul le bloc « blocage daté » dans room_loop est nouveau.

CREATE OR REPLACE FUNCTION "public"."reserve_trunk_atomically"("_hotel_id" "text", "_booking_date" "date", "_booking_time" time without time zone, "_duration" integer, "_hotel_name" "text", "_client_first_name" "text", "_client_last_name" "text", "_client_email" "text", "_phone" "text", "_room_number" "text", "_client_note" "text", "_status" "text", "_payment_method" "text", "_payment_status" "text", "_total_price" numeric, "_language" "text", "_treatment_ids" "text"[], "_customer_id" "text" DEFAULT NULL::"text", "_therapist_gender" "text" DEFAULT NULL::"text", "_stripe_session_id" "text" DEFAULT NULL::"text", "_guest_count" integer DEFAULT 1, "_amenity_timing" "text" DEFAULT 'same'::"text", "_variant_ids" "text"[] DEFAULT NULL::"text"[]) RETURNS "uuid"
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
  _required_treatments   UUID[];
  _required_count        INTEGER := 0;
  _therapist_id          UUID := NULL;
  _solo_therapist_id     UUID := NULL;
  _covered_count         INTEGER;
  _travel_buffer         INTEGER;
  _turnover_buffer       INTEGER;
  _requested_dow         INTEGER;
  _treatment_record      RECORD;
  _variant_record        RECORD;
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

  -- Même contrainte au niveau de la variante choisie (formules Semaine / Week-end :
  -- même soin, jours et tarifs différents). Les jours de la variante priment sur
  -- ceux du soin ; une variante sans jours définis hérite simplement du soin.
  IF _variant_ids IS NOT NULL AND array_length(_variant_ids, 1) > 0 THEN
    FOR _variant_record IN
      SELECT tm.name, v.label, v.available_days
      FROM treatment_variants v
      JOIN treatment_menus tm ON tm.id = v.treatment_id
      WHERE v.id::text = ANY(_variant_ids)
    LOOP
      IF _variant_record.available_days IS NOT NULL
         AND array_length(_variant_record.available_days, 1) > 0
         AND NOT _requested_dow = ANY(_variant_record.available_days)
      THEN
        RAISE EXCEPTION 'DAY_CONSTRAINT_VIOLATION: La formule "% — %" n''est pas disponible ce jour-là.',
          _variant_record.name, _variant_record.label;
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
  FOR _am IN
    SELECT tm.amenity_id, tm.duration AS am_duration, tm.price AS am_price, va.capacity_per_slot
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
      -- Add-ons are supplements, not soins: they must never impose a requirement
      -- on the therapist. Amenities have no therapist either.
      SELECT array_agg(DISTINCT id) INTO _required_treatments
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
        AND COALESCE(is_addon, false) = false
        AND amenity_id IS NULL;
      _required_count := COALESCE(array_length(_required_treatments, 1), 0);
    END IF;

    -- Le filtre individuel ci-dessous et le comptage _qualified_available
    -- partagent la même boucle, donc le même prédicat par construction.
    _qualified_available := 0;
    FOR _therapist_id IN
      SELECT t.id
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
      -- Qualification : un thérapeute sans aucune association reste polyvalent
      -- (comportement hérité de skills) ; dès qu'il en a au moins une, il doit
      -- couvrir toutes les prestations requises.
      IF _required_count > 0
         AND EXISTS (SELECT 1 FROM therapist_treatments WHERE therapist_id = _therapist_id)
      THEN
        SELECT COUNT(*) INTO _covered_count
        FROM therapist_treatments
        WHERE therapist_id = _therapist_id
          AND treatment_menu_id = ANY(_required_treatments);
        IF _covered_count < _required_count THEN CONTINUE; END IF;
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

      -- Blocage ponctuel daté de la salle (shooting, maintenance, fermeture
      -- exceptionnelle). room_id NULL = tout le lieu.
      --
      -- Fermeture stricte : aucun _turnover_buffer de part et d'autre, à la
      -- différence des bookings ci-dessus. Cet invariant doit rester identique
      -- à computeSlotCapacity (_shared/availability.ts), sinon la dispo affichée
      -- au client diverge de ce que cette fonction accepte.
      --
      -- Volontairement limité aux lignes DATÉES (block_date = _booking_date) :
      -- étendre le garde-fou au récurrent hebdomadaire ferait échouer les
      -- bookings admin délibérément posés en pause déjeuner. Correction séparée.
      IF EXISTS (
        SELECT 1 FROM venue_blocked_slots bs
        WHERE bs.hotel_id = _hotel_id
          AND bs.is_active
          AND bs.block_date = _booking_date
          AND (bs.room_id IS NULL OR bs.room_id = _room.id)
          AND _new_start < (EXTRACT(HOUR FROM bs.end_time) * 60 + EXTRACT(MINUTE FROM bs.end_time))
          AND _new_end   > (EXTRACT(HOUR FROM bs.start_time) * 60 + EXTRACT(MINUTE FROM bs.start_time))
      ) THEN
        CONTINUE room_loop;
      END IF;

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

-- CREATE OR REPLACE préserve les privilèges ; ce GRANT est idempotent et sert
-- de filet si la fonction devait être recréée par ailleurs. Le flow client est
-- public (anon), la fonction doit rester appelable sans auth.
GRANT EXECUTE ON FUNCTION public.reserve_trunk_atomically(
  text, date, time without time zone, integer, text, text, text, text, text, text,
  text, text, text, text, numeric, text, text[], text, text, text, integer, text, text[]
) TO anon, authenticated, service_role;
