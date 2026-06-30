-- Migration: accept_booking assigns the accepting therapist to a specific duo leg.
--
-- For combo-duo bookings (one booking_treatments row per guest, i.e. row count =
-- guest_count), each accepting therapist is given the LONGEST still-unassigned
-- leg: the first to accept takes the longest soin, the next the shorter one.
-- The booking-row FOR UPDATE lock (taken below) serialises concurrent accepts on
-- the same booking, so the leg pick cannot race.
--
-- The result jsonb now carries `assigned_treatment` so the PWA can show the
-- therapist exactly which soin they accepted. Solo / variant-duo bookings are
-- untouched (no per-leg assignment, leg therapist_id stays NULL).

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
  _treatment_count integer;
  _new_status text;
  _assigned_leg_id uuid;
  _assigned_soin jsonb;
BEGIN
  -- SECURITY: Verify caller owns the therapist record
  IF NOT EXISTS (
    SELECT 1 FROM therapists
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock the booking row (serialises concurrent accepts on this booking)
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

  -- Insert into bridge table
  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now());

  _accepted_count := _accepted_count + 1;

  -- Combo-duo leg assignment: one booking_treatments row per guest.
  -- Give this therapist the longest still-unassigned leg.
  IF _booking_guest_count > 1 THEN
    SELECT COUNT(*) INTO _treatment_count
    FROM booking_treatments
    WHERE booking_id = _booking_id;

    IF _treatment_count = _booking_guest_count THEN
      SELECT bt.id INTO _assigned_leg_id
      FROM booking_treatments bt
      LEFT JOIN treatment_variants tv ON tv.id = bt.variant_id
      LEFT JOIN treatment_menus tm ON tm.id = bt.treatment_id
      WHERE bt.booking_id = _booking_id
        AND bt.therapist_id IS NULL
      ORDER BY COALESCE(tv.duration, tm.duration, 0) DESC, bt.id
      LIMIT 1;

      IF _assigned_leg_id IS NOT NULL THEN
        UPDATE booking_treatments
        SET therapist_id = _hairdresser_id
        WHERE id = _assigned_leg_id;

        SELECT jsonb_build_object(
          'treatment_id', bt.treatment_id,
          'variant_id', bt.variant_id,
          'name', tm.name,
          'duration', COALESCE(tv.duration, tm.duration)
        ) INTO _assigned_soin
        FROM booking_treatments bt
        LEFT JOIN treatment_variants tv ON tv.id = bt.variant_id
        LEFT JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.id = _assigned_leg_id;
      END IF;
    END IF;
  END IF;

  -- Determine new status
  IF _accepted_count >= _booking_guest_count THEN
    _new_status := 'confirmed';
  ELSE
    _new_status := 'awaiting_hairdresser_selection';
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
    'accepted_therapists', _accepted_count,
    'assigned_treatment', _assigned_soin
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;
