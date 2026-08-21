-- ==============================================================================
-- Migration : therapist_broadcast_waves
-- Description : Priorisation des thérapeutes par groupes, sollicités en vagues.
--   Un lieu peut ranger ses praticiens en groupes (1, 2, …). Seul le groupe le
--   plus prioritaire reçoit le push initial ; le suivant est sollicité après un
--   délai, ou immédiatement dès que tout le groupe courant a décliné.
--
--   Activation par la seule composition : tant que tous les praticiens d'un lieu
--   sont au rang 1, le broadcast reste à plat, à l'identique de l'existant.
-- ==============================================================================

-- ─── Rang de priorité du praticien DANS CE LIEU ──────────────────────────────
-- 1 = premier groupe sollicité. Défaut à 1 : aucune bascule de comportement sur
-- les lignes existantes.
ALTER TABLE therapist_venues
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'therapist_venues_priority_positive'
  ) THEN
    ALTER TABLE therapist_venues
      ADD CONSTRAINT therapist_venues_priority_positive CHECK (priority >= 1);
  END IF;
END $$;

-- Le cron d'escalade balaye les bookings, pas cette table, mais l'edge function
-- trie les praticiens d'un lieu par rang à chaque broadcast.
CREATE INDEX IF NOT EXISTS idx_therapist_venues_hotel_priority
  ON therapist_venues (hotel_id, priority);

-- ─── Latence avant sollicitation du groupe suivant ───────────────────────────
-- NULL = valeur par défaut (10 min). Le champ ne pilote PAS l'activation, il ne
-- fait que régler la cadence entre deux vagues.
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS therapist_escalation_delay_minutes INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_therapist_escalation_delay_range'
  ) THEN
    ALTER TABLE hotels
      ADD CONSTRAINT hotels_therapist_escalation_delay_range
      CHECK (therapist_escalation_delay_minutes IS NULL
             OR therapist_escalation_delay_minutes BETWEEN 1 AND 240);
  END IF;
END $$;

-- ─── État de la vague courante ───────────────────────────────────────────────
-- broadcast_wave = rang notifié en dernier. NULL = jamais broadcasté, ou lieu
-- sans groupes : le cron ignore ces bookings.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS broadcast_wave INTEGER,
  ADD COLUMN IF NOT EXISTS broadcast_wave_sent_at TIMESTAMPTZ;

-- File d'escalade : les résas en attente dont la vague courante a été envoyée,
-- de la plus ancienne à la plus récente.
CREATE INDEX IF NOT EXISTS idx_bookings_broadcast_wave_pending
  ON bookings (broadcast_wave_sent_at)
  WHERE status = 'pending' AND broadcast_wave IS NOT NULL;

-- ─── RLS : les concierges règlent les groupes de leurs lieux ─────────────────
-- 20260703130000 ne leur a ouvert que INSERT et DELETE sur therapist_venues ;
-- changer un praticien de groupe est un UPDATE.
DROP POLICY IF EXISTS "Concierges can update therapist priority in their hotels" ON public.therapist_venues;
CREATE POLICY "Concierges can update therapist priority in their hotels"
  ON public.therapist_venues
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  );

-- ─── reserve_trunk_atomically : pré-assignation solo triée par groupe ────────
-- Seul changement : ORDER BY tv.priority, t.id sur la boucle de sélection des
-- praticiens (l. ~2830). Sans lui, la pré-assignation retenait un praticien au
-- hasard et court-circuitait la priorisation par groupes.
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
    -- ORDER BY tv.priority : la pré-assignation solo retient le PREMIER praticien
    -- qualifié rencontré. Sans tri, elle tirait au hasard et court-circuitait la
    -- priorisation par groupes du lieu. t.id départage à rang égal — l'ordre
    -- n'était pas déterministe non plus.
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
      ORDER BY tv.priority, t.id
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

-- ─── Cron : escalade vers le groupe de thérapeutes suivant ───────────────────
-- Passage toutes les minutes : le délai est propre à chaque lieu, seule cette
-- granularité permet de le respecter (latence réelle D à D+1 min).
-- URL de PRODUCTION (wvderlgzetpptehxndqf). Cette migration est destinée à main ;
-- la variante staging du même cron pointe xfkujlgettlxdgrnqluw.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-booking-broadcast-cron') THEN
      PERFORM cron.unschedule('escalate-booking-broadcast-cron');
    END IF;

    PERFORM cron.schedule(
      'escalate-booking-broadcast-cron',
      '* * * * *',
      format(
        $sql$
          SELECT net.http_post(
            url     := %L,
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body    := '{}'::jsonb
          );
        $sql$,
        'https://wvderlgzetpptehxndqf.supabase.co/functions/v1/escalate-booking-broadcast'
      )
    );

    RAISE NOTICE 'Cron enregistré : escalate-booking-broadcast-cron (toutes les minutes)';

  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — cron ignoré (environnement local)';
  END IF;
END;
$$;
