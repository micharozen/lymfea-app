-- ==============================================================================
-- Migration : audit_source_client
--
-- Un déplacement fait par le client depuis le lien « Modifier ou annuler »
-- laissait bien une trace dans audit_log (le trigger trg_booking_audit suit
-- booking_date / booking_time / status / room_id), mais cette trace était
-- étiquetée `source = 'admin'` avec `changed_by = NULL` : l'historique de la
-- fiche admin laissait croire à une modification interne sans auteur.
--
-- Le client n'est pas un utilisateur authentifié — il n'y a donc pas d'uuid à
-- écrire dans changed_by. On qualifie l'ORIGINE plutôt que l'auteur :
-- reschedule_booking_public et begin_booking_cancellation posent un marqueur de
-- transaction que le trigger relit. Tous les autres chemins d'écriture, qui ne
-- posent rien, gardent 'admin' — comportement inchangé.
-- ==============================================================================

-- ── 1. Le trigger d'audit lit l'origine ──────────────────────────────────────
-- Repris à l'identique de sa définition active ; seules les deux valeurs
-- `source` passent de 'admin' en dur à la lecture du marqueur.

CREATE OR REPLACE FUNCTION public.log_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _old JSONB := '{}'::jsonb;
  _new JSONB := '{}'::jsonb;
  _changed BOOLEAN := false;
  -- Posé par les fonctions publiques appelées sans session authentifiée.
  -- Absent (cas général : admin, concierge, praticien) → 'admin', la valeur
  -- historique.
  _source TEXT := COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'admin');
BEGIN
  -- On INSERT: log the initial creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (
      table_name, record_id, changed_by, change_type,
      old_values, new_values, source, metadata
    ) VALUES (
      'bookings',
      NEW.id::text,
      auth.uid(),
      'insert',
      NULL,
      jsonb_build_object(
        'status', NEW.status,
        'payment_status', NEW.payment_status,
        'therapist_name', NEW.therapist_name,
        'booking_date', NEW.booking_date,
        'booking_time', NEW.booking_time,
        'total_price', NEW.total_price
      ),
      _source,
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'therapist_id', COALESCE(NEW.therapist_id::text, '')
      )
    );
    RETURN NEW;
  END IF;

  -- Compare each tracked field; record only those that changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _old := _old || jsonb_build_object('status', OLD.status);
    _new := _new || jsonb_build_object('status', NEW.status);
    _changed := true;
  END IF;

  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    _old := _old || jsonb_build_object('payment_status', OLD.payment_status);
    _new := _new || jsonb_build_object('payment_status', NEW.payment_status);
    _changed := true;
  END IF;

  IF OLD.therapist_id IS DISTINCT FROM NEW.therapist_id THEN
    _old := _old || jsonb_build_object('therapist_id', OLD.therapist_id, 'therapist_name', OLD.therapist_name);
    _new := _new || jsonb_build_object('therapist_id', NEW.therapist_id, 'therapist_name', NEW.therapist_name);
    _changed := true;
  END IF;

  IF OLD.booking_date IS DISTINCT FROM NEW.booking_date THEN
    _old := _old || jsonb_build_object('booking_date', OLD.booking_date);
    _new := _new || jsonb_build_object('booking_date', NEW.booking_date);
    _changed := true;
  END IF;

  IF OLD.booking_time IS DISTINCT FROM NEW.booking_time THEN
    _old := _old || jsonb_build_object('booking_time', OLD.booking_time);
    _new := _new || jsonb_build_object('booking_time', NEW.booking_time);
    _changed := true;
  END IF;

  IF OLD.duration IS DISTINCT FROM NEW.duration THEN
    _old := _old || jsonb_build_object('duration', OLD.duration);
    _new := _new || jsonb_build_object('duration', NEW.duration);
    _changed := true;
  END IF;

  IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
    _old := _old || jsonb_build_object('total_price', OLD.total_price);
    _new := _new || jsonb_build_object('total_price', NEW.total_price);
    _changed := true;
  END IF;

  IF OLD.payment_method IS DISTINCT FROM NEW.payment_method THEN
    _old := _old || jsonb_build_object('payment_method', OLD.payment_method);
    _new := _new || jsonb_build_object('payment_method', NEW.payment_method);
    _changed := true;
  END IF;

  IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    _old := _old || jsonb_build_object('room_id', OLD.room_id);
    _new := _new || jsonb_build_object('room_id', NEW.room_id);
    _changed := true;
  END IF;

  -- Skip if nothing tracked changed
  IF NOT _changed THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, changed_by, change_type,
    old_values, new_values, source, metadata
  ) VALUES (
    'bookings',
    NEW.id::text,
    auth.uid(),
    'update',
    _old,
    _new,
    _source,
    jsonb_build_object(
      'booking_id', NEW.booking_id,
      'therapist_id', COALESCE(NEW.therapist_id::text, '')
    )
  );

  RETURN NEW;
END;
$function$;

-- ── 2. reschedule_booking_public pose le marqueur ────────────────────────────
-- Reprise à l'identique de 20260907140000_reschedule_guardrails.sql ; seul le
-- PERFORM set_config en tête est nouveau.

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
  -- Le client n'a pas d'auth.uid() : on qualifie l'origine de l'écriture pour
  -- que trg_booking_audit n'étiquette pas ce déplacement comme une modification
  -- admin sans auteur. set_config(..., true) = portée transaction : le marqueur
  -- disparaît au COMMIT et ne peut pas fuir sur une écriture suivante.
  PERFORM set_config('app.audit_source', 'client', true);

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

-- ── 3. Annulation depuis le lien public ──────────────────────────────────────
-- Même angle mort : begin_booking_cancellation écrit le statut 'cancelled' sans
-- auth.uid(), et l'entrée d'audit repartait en 'admin'. cancel-booking ne laisse
-- _cancelled_by à NULL que dans sa branche « token » — le lien client sans
-- session ; toute annulation staff passe par la branche authentifiée et
-- renseigne l'appelant. Ce NULL est donc un signal fiable d'origine client.
--
-- Reprise à l'identique de la définition active (20260513110000) ; seul le bloc
-- set_config en tête est nouveau.

CREATE OR REPLACE FUNCTION public.begin_booking_cancellation(
  _booking_id uuid,
  _reason text,
  _cancelled_by uuid,
  _cancellation_fee_amount numeric,
  _refund_amount numeric
)
RETURNS SETOF bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current_status TEXT;
  _gift_restored_cents INTEGER := 0;
BEGIN
  IF _cancelled_by IS NULL THEN
    PERFORM set_config('app.audit_source', 'client', true);
  END IF;

  SELECT status
  INTO _current_status
  FROM public.bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _current_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

  WITH usage_totals AS (
    SELECT
      customer_bundle_id,
      SUM(amount_cents_used)::INTEGER AS amount_cents
    FROM public.bundle_amount_usages
    WHERE booking_id = _booking_id
    GROUP BY customer_bundle_id
  ),
  restored_bundles AS (
    UPDATE public.customer_treatment_bundles ctb
    SET
      used_amount_cents = GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents),
      status = CASE
        WHEN ctb.status = 'completed'
          AND ctb.total_amount_cents IS NOT NULL
          AND GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents) < ctb.total_amount_cents
          AND ctb.expires_at >= CURRENT_DATE
        THEN 'active'
        ELSE ctb.status
      END,
      updated_at = NOW()
    FROM usage_totals
    WHERE ctb.id = usage_totals.customer_bundle_id
    RETURNING usage_totals.amount_cents
  )
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  INTO _gift_restored_cents
  FROM restored_bundles;

  DELETE FROM public.bundle_amount_usages
  WHERE booking_id = _booking_id;

  INSERT INTO public.booking_payment_infos (
    booking_id,
    customer_id,
    estimated_price,
    cancelled_at,
    cancelled_by,
    cancellation_fee_amount,
    refund_amount,
    updated_at
  )
  SELECT
    b.id,
    COALESCE(bpi.customer_id, b.customer_id),
    COALESCE(bpi.estimated_price, b.total_price),
    NOW(),
    _cancelled_by,
    COALESCE(_cancellation_fee_amount, 0),
    COALESCE(_refund_amount, 0),
    NOW()
  FROM public.bookings b
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  WHERE b.id = _booking_id
  ON CONFLICT (booking_id) DO UPDATE SET
    cancelled_at = EXCLUDED.cancelled_at,
    cancelled_by = EXCLUDED.cancelled_by,
    cancellation_fee_amount = EXCLUDED.cancellation_fee_amount,
    refund_amount = EXCLUDED.refund_amount,
    estimated_price = COALESCE(booking_payment_infos.estimated_price, EXCLUDED.estimated_price),
    customer_id = COALESCE(booking_payment_infos.customer_id, EXCLUDED.customer_id),
    updated_at = NOW();

  RETURN QUERY
  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    gift_amount_applied_cents = GREATEST(0, gift_amount_applied_cents - _gift_restored_cents)
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) TO service_role;
