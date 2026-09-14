-- ==============================================================================
-- Migration : accept_booking_split_legs
-- Description : partage d'un booking simple entre plusieurs praticiens (issue #547).
--
--   Une cliente réserve deux soins à la chaîne (corps + visage) hors duo. Aucun
--   praticien ne réalise les deux : le contrôle « couvrir TOUTES les prestations »
--   (branche solo, migration 20260821140000) rendait 'not_qualified' à chacun,
--   alors qu'un praticien peut très bien faire le corps et un autre le visage.
--
--   La qualification partielle, jusqu'ici réservée au duo, devient la règle
--   générale : il suffit de couvrir au moins une prestation encore libre. Ce
--   n'est plus `guest_count` qui dit si une réservation est partagée, mais l'état
--   des jambes (booking_treatments non-addon, hors amenity, therapist_id NULL).
--
--   Trois corollaires :
--     1. Complétude. Le passage en 'confirmed' exigeait `accepted >= guest_count`.
--        Un solo partagé serait donc confirmé dès le premier praticien, jambe
--        visage non pourvue. Il faut désormais les DEUX conditions : assez de
--        praticiens ET plus aucune jambe libre. Le duo partagé (un soin unique
--        exécuté en parallèle par deux praticiens, donc zéro jambe libre après le
--        premier claim) reste couvert par la condition sur `guest_count`.
--     2. Claim. Sur un booking simple, le praticien réclame TOUTES les jambes
--        qu'il sait faire, pas la première (LIMIT 1). Sans ça, le cas normal —
--        un seul praticien qui enchaîne les deux soins — resterait bloqué en
--        'pending' avec une jambe orpheline. En duo, on garde une jambe par
--        praticien (round-robin).
--     3. `already_taken` sur un booking simple ne se déclenche plus que s'il ne
--        reste aucune jambe à pourvoir : c'est ce garde-fou qui interdisait à un
--        seconde praticien de rejoindre un booking simple.
--
--   Les jambes d'amenity sont explicitement exclues du claim, comme elles
--   l'étaient déjà du contrôle de qualification : une commodité ne mobilise
--   aucun praticien et ne doit pas consommer une jambe.
--
--   Version reprise de 20260821140000_accept_booking_duo_partial_qualification.sql
--   (dernière définition active). Miroir déclaratif : supabase/schemas/80_functions.sql.
-- ==============================================================================

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

  IF EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id AND therapist_id = _hairdresser_id
  ) THEN
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
  ON CONFLICT (booking_id, therapist_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

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
