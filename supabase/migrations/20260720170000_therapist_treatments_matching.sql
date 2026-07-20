-- ============================================================
-- Release 2 : le matching thérapeute passe de therapists.skills (catégories)
-- à la table de jointure therapist_treatments (prestations réelles).
--
-- Jusqu'ici la règle de qualification était réimplémentée en trois endroits avec
-- des sémantiques divergentes (RPC : toutes les spécialités requises ; edge
-- get-availability : au moins une ; hook admin : toutes, sans fallback). Sur un
-- panier multi-soins, l'edge pouvait donc afficher un créneau que ce RPC
-- refusait ensuite — le client payait puis la réservation échouait.
--
-- Sémantique retenue, identique à celle de skills pour éviter toute régression
-- « zéro dispo » à la bascule :
--   - aucune association  → le thérapeute est polyvalent (qualifie pour tout)
--   - au moins une        → il doit couvrir TOUTES les prestations requises
--
-- Prestations « requises » = treatment_menus du panier avec is_addon = false ET
-- amenity_id IS NULL. Un add-on est réalisé par le thérapeute du soin de base ;
-- une amenity (piscine, sauna) ne mobilise aucun thérapeute. Ce prédicat est
-- exactement celui qu'utilisait l'agrégation des spécialités.
--
-- 1. reserve_trunk_atomically : filtre individuel + comptage duo
-- 2. accept_booking : garde-fou (un non-qualifié ne peut pas s'auto-assigner)
-- 3. get_public_therapists : ne renvoie plus skills
-- ============================================================

-- 1. reserve_trunk_atomically ------------------------------------------------
-- Repris de 20260715130000_treatments_as_amenities.sql. Seul le bloc de
-- qualification change ; le reste (verrou anti-race, capacité amenity,
-- shifts, conflits, allocation des salles) est inchangé.
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
  _required_treatments   UUID[];
  _required_count        INTEGER := 0;
  _therapist_id          UUID := NULL;
  _solo_therapist_id     UUID := NULL;
  _covered_count         INTEGER;
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
      -- Add-ons are supplements, not soins: they must never impose a requirement
      -- on the therapist. Amenities have no therapist either.
      SELECT array_agg(DISTINCT id) INTO _required_treatments
      FROM treatment_menus
      WHERE id::text = ANY(_treatment_ids)
        AND COALESCE(is_addon, false) = false
        AND amenity_id IS NULL;
      _required_count := COALESCE(array_length(_required_treatments, 1), 0);
    END IF;

    -- Therapist availability is room-independent. A duo needs >= guest_count
    -- distinct practitioners free on this slot. Le filtre individuel ci-dessous
    -- et le comptage _qualified_available partagent la même boucle, donc le même
    -- prédicat de qualification par construction.
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

-- 2. accept_booking : garde-fou de qualification -----------------------------
-- Repris de 20260710120100_accept_booking_claims_leg.sql (la version courante ;
-- 80_functions.sql est en retard sur cette fonction, ne pas s'en servir de base).
-- Le broadcast est désormais filtré côté edge, mais accept_booking est appelable
-- directement : sans ce contrôle un thérapeute non qualifié pourrait s'assigner
-- un booking que reserve_trunk_atomically lui aurait refusé.
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
  _claimed_treatment_id uuid;
  _required_count integer;
  _covered_count integer;
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Qualification : même règle que reserve_trunk_atomically. Add-ons et
  -- amenities exclus ; aucune association = polyvalent.
  IF EXISTS (SELECT 1 FROM therapist_treatments WHERE therapist_id = _hairdresser_id) THEN
    SELECT COUNT(DISTINCT bt.treatment_id),
           COUNT(DISTINCT bt.treatment_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM therapist_treatments tt
               WHERE tt.therapist_id = _hairdresser_id
                 AND tt.treatment_menu_id = bt.treatment_id
             )
           )
    INTO _required_count, _covered_count
    FROM booking_treatments bt
    JOIN treatment_menus tm ON tm.id = bt.treatment_id
    WHERE bt.booking_id = _booking_id
      AND bt.is_addon = false
      AND tm.amenity_id IS NULL;

    IF _required_count > 0 AND _covered_count < _required_count THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_qualified');
    END IF;
  END IF;

  -- Lock the booking row
  SELECT therapist_id, guest_count
  INTO _current_therapist_id, _booking_guest_count
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  _booking_guest_count := COALESCE(_booking_guest_count, 1);

  -- For single-guest bookings: check if already taken (backward compat)
  IF _booking_guest_count = 1 THEN
    IF _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_taken');
    END IF;
  END IF;

  -- Check if this therapist already accepted this booking
  IF EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id AND therapist_id = _hairdresser_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  -- Check if booking already has enough therapists
  SELECT COUNT(*) INTO _accepted_count
  FROM booking_therapists
  WHERE booking_id = _booking_id AND status = 'accepted';

  IF _accepted_count >= _booking_guest_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'fully_staffed');
  END IF;

  -- Insert into bridge table. ON CONFLICT DO NOTHING guards against a concurrent
  -- direct insert of the same (booking_id, therapist_id) between the check above
  -- and here; in that case FOUND is false and we bail out as 'already_accepted'.
  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now())
  ON CONFLICT (booking_id, therapist_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  _accepted_count := _accepted_count + 1;

  -- Claim the oldest free base soin. In a shared-duo the second accepter finds
  -- none: _claimed_treatment_id stays NULL and no line is attributed to them.
  UPDATE booking_treatments
  SET therapist_id = _hairdresser_id
  WHERE id = (
    SELECT id FROM booking_treatments
    WHERE booking_id = _booking_id
      AND is_addon = false
      AND therapist_id IS NULL
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE
  )
  RETURNING id INTO _claimed_treatment_id;

  -- The add-ons hanging off that soin belong to the same leg.
  IF _claimed_treatment_id IS NOT NULL THEN
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE booking_id = _booking_id
      AND is_addon = true
      AND parent_booking_treatment_id = _claimed_treatment_id;
  END IF;

  -- Orphan add-ons (parent removed from the cart) go to the first accepter.
  IF _accepted_count = 1 THEN
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE booking_id = _booking_id
      AND is_addon = true
      AND parent_booking_treatment_id IS NULL
      AND therapist_id IS NULL;
  END IF;

  -- Determine new status: 'confirmed' once all slots are filled, otherwise the
  -- booking stays 'pending' (a duo still needing therapists is pending + guest_count > 1).
  IF _accepted_count >= _booking_guest_count THEN
    _new_status := 'confirmed';
  ELSE
    _new_status := 'pending';
  END IF;

  -- Update booking: set first therapist as primary (backward compat), update status
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

-- 3. get_public_therapists : ne renvoie plus skills --------------------------
-- Le type de retour change → DROP obligatoire. CASCADE emporte le wrapper de
-- compat get_public_hairdressers, recréé juste après.
DROP FUNCTION IF EXISTS public.get_public_therapists(text) CASCADE;

CREATE OR REPLACE FUNCTION public.get_public_therapists(_hotel_id text)
RETURNS TABLE(id text, first_name text, profile_image text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.first_name, t.profile_image
  FROM public.therapists t
  INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
  -- LOWER() : l'ancien IN ('Active','Actif','active') était sensible à la casse
  -- et divergeait du filtre de reserve_trunk_atomically.
  WHERE tv.hotel_id = _hotel_id AND LOWER(t.status) IN ('active', 'actif')
  ORDER BY t.first_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_therapists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_therapists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_therapists(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_hairdressers(_hotel_id text)
RETURNS TABLE(id text, first_name text, profile_image text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.get_public_therapists(_hotel_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hairdressers(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_hairdressers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hairdressers(text) TO service_role;
