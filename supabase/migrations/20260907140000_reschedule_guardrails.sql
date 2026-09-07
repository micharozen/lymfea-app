-- ==============================================================================
-- Migration : reschedule_guardrails
--
-- Le lien « Modifier ou annuler » de l'email de confirmation menait à une RPC
-- publique qui déplaçait la réservation par un UPDATE nu : aucun cutoff, aucune
-- re-vérification de salle, aucun impact sur le staffing. Une réservation
-- confirmée restait « confirmée » à une date que le praticien n'avait jamais
-- acceptée.
--
-- Cette migration pose trois règles :
--
--   1. Cutoff. Plus de modification en ligne à moins de
--      hotels.client_reschedule_cutoff_hours (défaut 24) du soin. Réglage
--      distinct de client_cancellation_cutoff_hours (défaut 2), qui continue de
--      gouverner l'annulation seule.
--
--   2. Salle. Le nouveau créneau rejoue l'allocation gloutonne de
--      reserve_trunk_atomically (primaire + débord secondaire, règle de lits
--      partagés LEAST(guest_count, capacity)) en s'excluant elle-même. Rien de
--      libre → NO_ROOM_AVAILABLE, la réservation ne bouge pas.
--
--   3. Staffing. Toute modification renvoie la réservation en 'pending'. Une
--      réservation qui était 'confirmed' entre en RE-CONFIRMATION : ses lignes
--      booking_therapists passent de 'accepted' à 'reconfirm_pending', leurs
--      prestations sont libérées, et pendant RECONFIRM_WINDOW (90 min) seuls ces
--      praticiens-là sont sollicités — accepter les maintient. Passé ce délai
--      (cron escalate-booking-broadcast) ou dès qu'un praticien refuse
--      (decline_booking), la réservation s'ouvre à tout le vivier éligible.
--
-- accept_booking et decline_booking sont repris depuis leurs dernières
-- définitions actives (20260902100000 et 20260429120001) ; seuls les blocs
-- signalés changent. Miroir déclaratif : supabase/schemas/80_functions.sql.
-- ==============================================================================

-- ── 1. Réglages ───────────────────────────────────────────────────────────────

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS client_reschedule_cutoff_hours numeric NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.hotels.client_reschedule_cutoff_hours IS
  'Délai minimum, en heures avant le soin, en deçà duquel le client ne peut plus déplacer sa réservation en ligne.';

-- Fin de la fenêtre pendant laquelle seuls les praticiens déjà engagés sont
-- sollicités après un déplacement. NULL = pas de re-confirmation en cours.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reconfirm_until timestamptz;

COMMENT ON COLUMN public.bookings.reconfirm_until IS
  'Réservation déplacée : tant que ce délai court, seuls les praticiens en booking_therapists.status = reconfirm_pending sont sollicités.';

CREATE INDEX IF NOT EXISTS idx_bookings_reconfirm_until
  ON public.bookings (reconfirm_until)
  WHERE reconfirm_until IS NOT NULL;

-- ── 2. Read model public : exposer le cutoff de modification ──────────────────
-- ManageBooking lit déjà cette RPC ; y ajouter le réglage évite un aller-retour
-- de plus et garde la règle affichée alignée sur celle qu'applique le serveur.

DROP FUNCTION IF EXISTS public.get_public_booking(text);

CREATE FUNCTION public.get_public_booking(p_token text)
RETURNS TABLE (
  id uuid,
  booking_id bigint,
  booking_date date,
  booking_time text,
  client_first_name text,
  client_last_name text,
  phone text,
  client_email text,
  hotel_id text,
  hotel_name text,
  room_number text,
  total_price numeric,
  status text,
  language text,
  short_token text,
  payment_method text,
  payment_status text,
  card_brand text,
  card_last4 text,
  estimated_price numeric,
  reschedule_cutoff_hours numeric,
  booking_treatments jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    b.id,
    b.booking_id,
    b.booking_date,
    b.booking_time,
    b.client_first_name,
    b.client_last_name,
    b.phone,
    b.client_email,
    b.hotel_id::text,
    b.hotel_name,
    b.room_number,
    b.total_price,
    b.status,
    b.language,
    b.short_token,
    b.payment_method,
    b.payment_status,
    bpi.card_brand,
    bpi.card_last4,
    bpi.estimated_price,
    COALESCE(h.client_reschedule_cutoff_hours, 24),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'treatment_id', bt.treatment_id,
          'treatment', jsonb_build_object(
            'id', tm.id,
            'name', tm.name,
            'duration', tm.duration,
            'price', tm.price
          )
        )
      ) FILTER (WHERE bt.id IS NOT NULL),
      '[]'::jsonb
    ) AS booking_treatments
  FROM public.bookings b
  LEFT JOIN public.hotels h ON h.id = b.hotel_id
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  LEFT JOIN public.booking_treatments bt ON bt.booking_id = b.id
  LEFT JOIN public.treatment_menus tm ON tm.id = bt.treatment_id
  WHERE (p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND b.id = p_token::uuid)
     OR b.short_token = p_token
  GROUP BY b.id, b.payment_status, bpi.card_brand, bpi.card_last4, bpi.estimated_price,
           h.client_reschedule_cutoff_hours;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_booking(text) TO anon, authenticated;

-- ── 3. Déplacement public ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reschedule_booking_public(text, text, text);

CREATE FUNCTION public.reschedule_booking_public(
  p_token text,
  p_new_date text,
  p_new_time text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Fenêtre d'exclusivité laissée aux praticiens déjà engagés. Volontairement en
  -- dur : c'est une règle de service, pas un réglage de lieu.
  _reconfirm_window constant interval := interval '90 minutes';

  _booking          record;
  _venue            record;
  _new_date         date;
  _new_time         time;
  _duration         integer;
  _guests           integer;
  _turnover_buffer  integer;
  _new_start        integer;
  _new_end          integer;
  _room             record;
  _occupied_beds    integer;
  _free             integer;
  _remaining        integer;
  _primary_room_id  uuid := NULL;
  _secondary_room_id uuid := NULL;
  _was_confirmed    boolean;
  _base_price       numeric;
  _surcharge        numeric := 0;
  _out_of_hours     boolean := false;
  _reconfirm_count  integer := 0;
BEGIN
  BEGIN
    _new_date := p_new_date::date;
    _new_time := p_new_time::time;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_slot');
  END;

  SELECT * INTO _booking
  FROM public.bookings
  WHERE (id = CASE
                WHEN p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN p_token::uuid
                ELSE NULL
              END
         OR short_token = p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF _booking.status IN ('cancelled', 'completed', 'noshow', 'Annulé', 'Terminé') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_reschedulable');
  END IF;

  SELECT COALESCE(h.timezone, 'UTC')                        AS timezone,
         COALESCE(h.client_reschedule_cutoff_hours, 24)     AS cutoff_hours,
         COALESCE(h.room_turnover_buffer_minutes, 0)        AS turnover_buffer,
         h.opening_time,
         h.closing_time,
         COALESCE(h.allow_out_of_hours_booking, false)      AS allow_out_of_hours,
         COALESCE(h.out_of_hours_surcharge_percent, 0)      AS surcharge_percent
  INTO _venue
  FROM public.hotels h
  WHERE h.id = _booking.hotel_id;

  -- Cutoff mesuré sur le créneau ACTUEL : c'est lui que l'équipe a préparé.
  IF ((_booking.booking_date + _booking.booking_time) AT TIME ZONE _venue.timezone)
       <= now() + (_venue.cutoff_hours * interval '1 hour') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'too_late',
      'cutoff_hours', _venue.cutoff_hours
    );
  END IF;

  IF ((_new_date + _new_time) AT TIME ZONE _venue.timezone) <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'past_slot');
  END IF;

  IF _new_date = _booking.booking_date AND _new_time = _booking.booking_time THEN
    RETURN jsonb_build_object('success', false, 'error', 'unchanged');
  END IF;

  -- ── Allocation de salle sur le nouveau créneau ──────────────────────────────
  -- Même algorithme glouton que reserve_trunk_atomically : on remplit une salle
  -- primaire jusqu'à sa capacité libre puis on déborde sur une secondaire. La
  -- réservation en cours de déplacement s'exclut du décompte, sinon elle se
  -- bloquerait elle-même sur un simple changement d'heure dans la même journée.
  _duration        := COALESCE(_booking.duration, 30);
  _guests          := GREATEST(1, COALESCE(_booking.guest_count, 1));
  _turnover_buffer := _venue.turnover_buffer;
  _new_start       := EXTRACT(HOUR FROM _new_time) * 60 + EXTRACT(MINUTE FROM _new_time);
  _new_end         := _new_start + _duration;
  _remaining       := _guests;

  <<room_loop>>
  FOR _room IN
    SELECT id, capacity FROM public.treatment_rooms
    WHERE hotel_id::text = _booking.hotel_id::text
      AND LOWER(status) IN ('active', 'actif')
    ORDER BY id
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN b.room_id = _room.id
          THEN LEAST(COALESCE(b.guest_count, 1), COALESCE(rr_primary.capacity, 1))
        WHEN b.secondary_room_id = _room.id
          THEN COALESCE(b.guest_count, 1) - LEAST(COALESCE(b.guest_count, 1), COALESCE(rr_primary.capacity, 1))
        ELSE 0
      END
    ), 0) INTO _occupied_beds
    FROM public.bookings b
    LEFT JOIN public.treatment_rooms rr_primary ON rr_primary.id = b.room_id
    WHERE (b.room_id = _room.id OR b.secondary_room_id = _room.id)
      AND b.id <> _booking.id
      AND b.booking_date = _new_date
      AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
      AND NOT (b.payment_status = 'awaiting_payment' AND b.created_at < NOW() - INTERVAL '10 minutes')
      AND (_new_start < (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)) + COALESCE(b.duration, 30) + _turnover_buffer
           AND _new_end + _turnover_buffer > (EXTRACT(HOUR FROM b.booking_time) * 60 + EXTRACT(MINUTE FROM b.booking_time)));

    _free := GREATEST(0, COALESCE(_room.capacity, 1) - _occupied_beds);
    IF _free <= 0 THEN CONTINUE room_loop; END IF;

    IF _primary_room_id IS NULL THEN
      _primary_room_id := _room.id;
    ELSE
      _secondary_room_id := _room.id;
    END IF;
    _remaining := _remaining - LEAST(_remaining, _free);

    EXIT room_loop WHEN _remaining <= 0;
  END LOOP;

  IF _primary_room_id IS NULL OR _remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ROOM_AVAILABLE');
  END IF;

  -- ── Majoration hors horaires ────────────────────────────────────────────────
  -- bookings.total_price inclut la majoration : la recalculer est obligatoire dès
  -- que l'heure change, sinon l'invariant casse silencieusement.
  _base_price := COALESCE(_booking.total_price, 0) - COALESCE(_booking.surcharge_amount, 0);
  IF _venue.allow_out_of_hours
     AND _venue.opening_time IS NOT NULL
     AND _venue.closing_time IS NOT NULL
     AND (_new_time < _venue.opening_time OR _new_time >= _venue.closing_time) THEN
    _out_of_hours := true;
    _surcharge := ROUND(_base_price * _venue.surcharge_percent / 100);
  END IF;

  -- ── Staffing ────────────────────────────────────────────────────────────────
  _was_confirmed := _booking.status = 'confirmed';

  IF _was_confirmed THEN
    SELECT COUNT(*) INTO _reconfirm_count
    FROM public.booking_therapists
    WHERE booking_id = _booking.id AND status = 'accepted';
  END IF;

  -- Une réservation déplacée n'est plus pourvue : elle redevient une demande.
  -- declined_by et les vagues repartent de zéro — un praticien qui avait refusé
  -- l'ancien créneau peut très bien accepter le nouveau.
  --
  -- prevent_overlapping_treatment_room_bookings a le dernier mot sur la salle et
  -- lève ROOM_ALREADY_BOOKED : sa règle est plus stricte que l'allocation par
  -- capacité ci-dessus, et une écriture concurrente peut de toute façon avoir pris
  -- la place entre-temps. Le sous-bloc annule l'écriture et rend le même verdict
  -- que la boucle salle, pour que l'appelant n'ait qu'un cas à traiter.
  BEGIN
    UPDATE public.bookings
    SET booking_date       = _new_date,
        booking_time       = _new_time,
        room_id            = _primary_room_id,
        secondary_room_id  = _secondary_room_id,
        status             = 'pending',
        therapist_id       = NULL,
        therapist_name     = NULL,
        assigned_at        = NULL,
        declined_by        = '{}'::uuid[],
        broadcast_wave     = NULL,
        broadcast_wave_sent_at = NULL,
        reconfirm_until    = CASE WHEN _reconfirm_count > 0 THEN now() + _reconfirm_window ELSE NULL END,
        is_out_of_hours    = _out_of_hours,
        surcharge_amount   = _surcharge,
        total_price        = _base_price + _surcharge,
        updated_at         = now()
    WHERE id = _booking.id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%ROOM_ALREADY_BOOKED%' THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_ROOM_AVAILABLE');
    END IF;
    RAISE;
  END;

  IF _was_confirmed THEN
    -- Les praticiens engagés gardent leur place le temps de répondre : la ligne
    -- de jonction n'est pas supprimée, elle repasse en attente de re-confirmation.
    UPDATE public.booking_therapists
    SET status = 'reconfirm_pending'
    WHERE booking_id = _booking.id
      AND status = 'accepted';

    -- Prestations libérées : accept_booking les réattribue à qui re-confirme, et
    -- le broadcast général sait quelles jambes restent à pourvoir.
    UPDATE public.booking_treatments
    SET therapist_id = NULL
    WHERE booking_id = _booking.id;
  END IF;

  -- La dédup des push est indexée sur (booking, user, prestation) : sans purge,
  -- aucun praticien déjà notifié à l'ancienne date ne serait re-sollicité.
  DELETE FROM public.push_notification_logs WHERE booking_id = _booking.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', _booking.id,
    'was_confirmed', _was_confirmed,
    'reconfirm_therapists', _reconfirm_count,
    'total_price', _base_price + _surcharge
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_public(text, text, text) TO anon, authenticated;

-- ── 4. accept_booking : accepter la re-confirmation ───────────────────────────
-- Repris de 20260902100000_accept_booking_split_legs.sql. Deux changements :
--   · une ligne 'reconfirm_pending' n'est plus lue comme 'already_accepted' —
--     c'est précisément la réponse qu'on attend du praticien déplacé ;
--   · la fenêtre de re-confirmation se referme dès que plus personne n'est en
--     attente de réponse.

CREATE OR REPLACE FUNCTION public.accept_booking(
  _booking_id uuid,
  _hairdresser_id uuid,
  _hairdresser_name text,
  _total_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _current_therapist_id uuid;
  _booking_guest_count integer;
  _accepted_count integer;
  _new_status text;
  _has_associations boolean;
  _open_legs integer;
  _my_open_legs integer;
  _claimed_legs integer;
  _qualified boolean;
  _existing_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT therapist_id, guest_count
  INTO _current_therapist_id, _booking_guest_count
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  _booking_guest_count := COALESCE(_booking_guest_count, 1);

  _has_associations := EXISTS (
    SELECT 1 FROM therapist_treatments WHERE therapist_id = _hairdresser_id
  );

  -- Jambes à pourvoir, jambes déjà attribuées, et parmi les libres celles que CE
  -- praticien peut exécuter. Un praticien sans aucune association reste
  -- polyvalent (héritage de skills).
  SELECT COUNT(*) FILTER (WHERE bt.therapist_id IS NULL),
         COUNT(*) FILTER (
           WHERE bt.therapist_id IS NULL
             AND (
               NOT _has_associations
               OR EXISTS (
                    SELECT 1 FROM therapist_treatments tt
                    WHERE tt.therapist_id = _hairdresser_id
                      AND tt.treatment_menu_id = bt.treatment_id
                  )
             )
         ),
         COUNT(*) FILTER (WHERE bt.therapist_id IS NOT NULL)
  INTO _open_legs, _my_open_legs, _claimed_legs
  FROM booking_treatments bt
  JOIN treatment_menus tm ON tm.id = bt.treatment_id
  WHERE bt.booking_id = _booking_id
    AND bt.is_addon = false
    AND tm.amenity_id IS NULL;

  -- L'état de la réservation prime sur la qualification : un praticien arrivé
  -- sur une résa déjà complète doit lire 'already_taken' / 'fully_staffed', pas
  -- un motif de refus trompeur (enquête #1439).
  --
  -- Sur un booking simple déjà pris par un confrère, un second praticien n'est
  -- admis que si la réservation est réellement partagée : une jambe libre ET une
  -- jambe déjà attribuée. Exiger `_claimed_legs > 0` protège les réservations
  -- historiques, dont les lignes ne portent aucun therapist_id alors que le
  -- praticien principal assure tout : sans ce garde-fou, elles passeraient pour
  -- « entièrement à pourvoir » et un tiers pourrait s'y inviter.
  IF _booking_guest_count = 1
     AND _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id
     AND (_open_legs = 0 OR _claimed_legs = 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  -- Seule une acceptation ferme fait doublon. 'reconfirm_pending' est au
  -- contraire l'état d'un praticien à qui l'on demande de se prononcer sur un
  -- créneau déplacé : sa réponse doit être reçue.
  SELECT status INTO _existing_status
  FROM booking_therapists
  WHERE booking_id = _booking_id AND therapist_id = _hairdresser_id;

  IF _existing_status = 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  SELECT COUNT(*) INTO _accepted_count
  FROM booking_therapists
  WHERE booking_id = _booking_id AND status = 'accepted';

  IF _accepted_count >= _booking_guest_count AND _open_legs = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'fully_staffed');
  END IF;

  -- Qualification. Cas courant : couvrir au moins une jambe libre. Cas du duo
  -- partagé (un soin unique exécuté en parallèle : plus aucune jambe libre mais
  -- une place invité à pourvoir), la qualification se lit sur les soins de base
  -- de la réservation.
  IF _open_legs = 0 THEN
    _qualified := NOT _has_associations OR EXISTS (
      SELECT 1
      FROM booking_treatments bt
      JOIN treatment_menus tm ON tm.id = bt.treatment_id
      JOIN therapist_treatments tt
        ON tt.treatment_menu_id = bt.treatment_id
       AND tt.therapist_id = _hairdresser_id
      WHERE bt.booking_id = _booking_id
        AND bt.is_addon = false
        AND tm.amenity_id IS NULL
    );
  ELSE
    _qualified := _my_open_legs > 0;
  END IF;

  IF NOT _qualified THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_qualified');
  END IF;

  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now())
  ON CONFLICT (booking_id, therapist_id)
  DO UPDATE SET status = 'accepted', assigned_at = now();

  _accepted_count := _accepted_count + 1;

  IF _booking_guest_count = 1 THEN
    -- Booking simple : le praticien prend toutes les jambes qu'il réalise. Le cas
    -- courant (un seul praticien pour les deux soins) reste donc complet en une
    -- acceptation ; seules restent libres les jambes qu'il ne sait pas faire.
    UPDATE booking_treatments bt
    SET therapist_id = _hairdresser_id
    WHERE bt.booking_id = _booking_id
      AND bt.is_addon = false
      AND bt.therapist_id IS NULL
      AND EXISTS (
        SELECT 1 FROM treatment_menus tm
        WHERE tm.id = bt.treatment_id AND tm.amenity_id IS NULL
      )
      AND (
        NOT _has_associations
        OR EXISTS (
          SELECT 1 FROM therapist_treatments tt
          WHERE tt.therapist_id = _hairdresser_id
            AND tt.treatment_menu_id = bt.treatment_id
        )
      );
  ELSE
    -- Duo : une jambe par praticien. À égalité d'ancienneté, une prestation que
    -- le praticien réalise passe devant — sans quoi un praticien qualifié pour
    -- une seule jambe pouvait se voir attribuer l'autre. Sans association
    -- (polyvalent), l'EXISTS est faux partout et l'ordre historique s'applique.
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE id = (
      SELECT bt.id FROM booking_treatments bt
      JOIN treatment_menus tm ON tm.id = bt.treatment_id
      WHERE bt.booking_id = _booking_id
        AND bt.is_addon = false
        AND tm.amenity_id IS NULL
        AND bt.therapist_id IS NULL
      ORDER BY (
        EXISTS (
          SELECT 1 FROM therapist_treatments tt
          WHERE tt.therapist_id = _hairdresser_id
            AND tt.treatment_menu_id = bt.treatment_id
        )
      ) DESC, bt.created_at, bt.id
      LIMIT 1
      FOR UPDATE
    );
  END IF;

  -- Les add-ons suivent le soin auquel ils sont rattachés.
  UPDATE booking_treatments a
  SET therapist_id = _hairdresser_id
  WHERE a.booking_id = _booking_id
    AND a.is_addon = true
    AND a.therapist_id IS NULL
    AND EXISTS (
      SELECT 1 FROM booking_treatments p
      WHERE p.id = a.parent_booking_treatment_id
        AND p.therapist_id = _hairdresser_id
    );

  -- Add-ons sans parent (ajoutés avant que le lien stable n'existe) : au premier
  -- praticien arrivé.
  IF _accepted_count = 1 THEN
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE booking_id = _booking_id
      AND is_addon = true
      AND parent_booking_treatment_id IS NULL
      AND therapist_id IS NULL;
  END IF;

  -- Complétude : assez de praticiens ET plus aucune jambe à pourvoir.
  SELECT COUNT(*) INTO _open_legs
  FROM booking_treatments bt
  JOIN treatment_menus tm ON tm.id = bt.treatment_id
  WHERE bt.booking_id = _booking_id
    AND bt.is_addon = false
    AND tm.amenity_id IS NULL
    AND bt.therapist_id IS NULL;

  IF _accepted_count >= _booking_guest_count AND _open_legs = 0 THEN
    _new_status := 'confirmed';
  ELSE
    _new_status := 'pending';
  END IF;

  UPDATE bookings
  SET
    therapist_id = COALESCE(therapist_id, _hairdresser_id),
    therapist_name = COALESCE(therapist_name, _hairdresser_name),
    status = _new_status,
    assigned_at = CASE WHEN _new_status = 'confirmed' THEN now() ELSE assigned_at END,
    total_price = _total_price,
    -- Plus personne à relancer : la fenêtre d'exclusivité n'a plus d'objet et la
    -- réservation redevient une demande ordinaire pour le cron d'escalade.
    reconfirm_until = CASE
      WHEN EXISTS (
        SELECT 1 FROM booking_therapists
        WHERE booking_id = _booking_id AND status = 'reconfirm_pending'
      ) THEN reconfirm_until
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'therapist_id', therapist_id,
    'status', status,
    'guest_count', guest_count,
    'accepted_therapists', _accepted_count,
    'open_legs', _open_legs
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$function$;

-- ── 5. decline_booking : libérer la place et rouvrir à tous ───────────────────
-- Repris de 20260429120001. Le refus ne se contentait pas d'alimenter
-- declined_by : sur une réservation déplacée, le praticien garde sinon sa ligne
-- de jonction et ses prestations, et personne ne peut prendre le relais.

CREATE OR REPLACE FUNCTION public.decline_booking(_booking_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _therapist_id UUID;
  _booking_hotel_id TEXT;
  _is_affiliated BOOLEAN;
BEGIN
  -- 1. Resolve connected therapist identity
  SELECT id INTO _therapist_id
  FROM public.therapists
  WHERE user_id = auth.uid();

  IF _therapist_id IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : profil thérapeute introuvable pour cet utilisateur';
  END IF;

  -- 2. Check booking exists, is pending, and either unassigned OR assigned to this therapist
  SELECT hotel_id INTO _booking_hotel_id
  FROM public.bookings
  WHERE id = _booking_id
    AND status = 'pending'
    AND (therapist_id IS NULL OR therapist_id = _therapist_id);

  IF _booking_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà assignée ou non en attente';
  END IF;

  -- 3. Check therapist is affiliated to the booking's hotel
  SELECT EXISTS(
    SELECT 1 FROM public.therapist_venues
    WHERE therapist_id = _therapist_id
      AND hotel_id = _booking_hotel_id
  ) INTO _is_affiliated;

  IF NOT _is_affiliated THEN
    RAISE EXCEPTION 'Accès refusé : ce thérapeute n''est pas affilié à l''hôtel de cette réservation';
  END IF;

  -- 4. Add to declined_by (idempotent) and clear therapist_id so the
  --    booking returns to the unassigned pool for gender-fallback dispatch
  UPDATE public.bookings
  SET
    declined_by  = array_append(COALESCE(declined_by, ARRAY[]::uuid[]), _therapist_id),
    therapist_id = NULL
  WHERE id = _booking_id
    AND NOT (COALESCE(declined_by, ARRAY[]::uuid[]) @> ARRAY[_therapist_id]);

  -- 5. Rendre la place : la ligne de jonction et les prestations attribuées à ce
  --    praticien repartent au pot commun. Sans effet sur le flux d'origine (un
  --    praticien qui refuse une demande n'a jamais rien de tout ça), décisif sur
  --    une réservation déplacée.
  DELETE FROM public.booking_therapists
  WHERE booking_id = _booking_id AND therapist_id = _therapist_id;

  UPDATE public.booking_treatments
  SET therapist_id = NULL
  WHERE booking_id = _booking_id AND therapist_id = _therapist_id;

  -- 6. Un refus pendant la re-confirmation vaut ouverture immédiate : inutile
  --    d'attendre la fin de la fenêtre pour solliciter le reste du vivier.
  UPDATE public.bookings
  SET reconfirm_until = NULL
  WHERE id = _booking_id AND reconfirm_until IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_booking(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_booking(UUID) FROM anon;
