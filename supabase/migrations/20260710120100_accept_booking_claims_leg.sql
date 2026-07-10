-- accept_booking: the first therapist to accept claims the first free LEG.
--
-- A leg is one base soin plus the add-ons hanging off it. Until now the RPC only
-- wrote booking_therapists (the roster) and bookings.therapist_id (the primary),
-- never booking_treatments.therapist_id — so a broadcast duo left every line NULL
-- and the payout fell back to positional attribution.
--
-- Claiming order (all inside the existing FOR UPDATE, so concurrent accepts are
-- serialised and two therapists can never claim the same soin):
--   1. the oldest base soin still free  → this therapist;
--   2. every add-on parented to it      → same therapist (2 soins + 2 add-ons
--      therefore give each therapist 1 soin + 1 add-on);
--   3. orphan add-ons                   → the first accepter only.
--
-- Shared-duo (a single base soin for guest_count = 2): the second accepter finds
-- no free soin, claims nothing, and myLegDuration's parallel branch pays them the
-- lone soin's duration. That is the intended outcome, not an error.

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
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
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
