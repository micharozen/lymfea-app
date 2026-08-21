-- ==============================================================================
-- Migration : accept_booking_duo_partial_qualification
-- Description : qualification partielle en duo (enquête résa #1439, Cap
--   d'Antibes, 21/08 14:00, Johanna Dreessen).
--
--   La résa duo portait deux soins distincts (LET IT GO BODY + DÉTOX BODY).
--   Grégoire Aguilar, associé au seul LET IT GO BODY, obtenait 'not_qualified'
--   en cliquant « Rejoindre le soin » : le contrôle exigeait qu'un praticien
--   couvre TOUTES les prestations du booking. Vrai pour un solo (le même
--   praticien enchaîne les soins), faux pour un duo où chacun n'exécute qu'une
--   jambe. Désormais, en duo, il suffit de couvrir au moins une prestation
--   encore non attribuée.
--
--   Deux corollaires :
--     1. L'état du booking prime sur la qualification. already_taken /
--        already_accepted / fully_staffed sont évalués AVANT not_qualified,
--        sinon un praticien arrivé sur une résa déjà complète reçoit un motif
--        de refus trompeur (cas #1439 : la résa était complète depuis la
--        veille, mais not_qualified sortait en premier).
--     2. Le claim de jambe ne prend plus « la première libre » mais privilégie
--        une prestation que le praticien réalise effectivement — sans quoi un
--        praticien qualifié pour une seule jambe pouvait se voir attribuer
--        l'autre. Un praticien sans aucune association (polyvalent) retombe
--        sur l'ordre historique (created_at, id).
--
--   Version reprise de 20260720170000_therapist_treatments_matching.sql
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
  _claimed_treatment_id uuid;
  _required_count integer;
  _covered_count integer;
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

  IF _booking_guest_count = 1 THEN
    IF _current_therapist_id IS NOT NULL AND _current_therapist_id != _hairdresser_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_taken');
    END IF;
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

  IF _accepted_count >= _booking_guest_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'fully_staffed');
  END IF;

  -- Qualification : un praticien sans aucune association reste polyvalent
  -- (comportement hérité de skills). Dès qu'il en a au moins une, la règle
  -- dépend du format : solo = couvrir toutes les prestations, duo = couvrir au
  -- moins une des prestations encore libres (chacun n'exécute qu'une jambe).
  IF EXISTS (SELECT 1 FROM therapist_treatments WHERE therapist_id = _hairdresser_id) THEN
    IF _booking_guest_count > 1 THEN
      SELECT COUNT(*),
             COUNT(*) FILTER (
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
        AND tm.amenity_id IS NULL
        AND bt.therapist_id IS NULL;

      IF _required_count > 0 AND _covered_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_qualified');
      END IF;
    ELSE
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
  END IF;

  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now())
  ON CONFLICT (booking_id, therapist_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted');
  END IF;

  _accepted_count := _accepted_count + 1;

  -- Claim d'une jambe : à égalité d'ancienneté, une prestation que le praticien
  -- réalise passe devant. Sans association (polyvalent), l'EXISTS est faux
  -- partout et l'ordre historique (created_at, id) s'applique tel quel.
  UPDATE booking_treatments
  SET therapist_id = _hairdresser_id
  WHERE id = (
    SELECT bt.id FROM booking_treatments bt
    WHERE bt.booking_id = _booking_id
      AND bt.is_addon = false
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
  )
  RETURNING id INTO _claimed_treatment_id;

  IF _claimed_treatment_id IS NOT NULL THEN
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE booking_id = _booking_id
      AND is_addon = true
      AND parent_booking_treatment_id = _claimed_treatment_id;
  END IF;

  IF _accepted_count = 1 THEN
    UPDATE booking_treatments
    SET therapist_id = _hairdresser_id
    WHERE booking_id = _booking_id
      AND is_addon = true
      AND parent_booking_treatment_id IS NULL
      AND therapist_id IS NULL;
  END IF;

  IF _accepted_count >= _booking_guest_count THEN
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
    'accepted_therapists', _accepted_count
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$function$;
