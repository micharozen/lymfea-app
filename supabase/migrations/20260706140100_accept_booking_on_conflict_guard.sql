-- Harden accept_booking against duplicate booking_therapists rows.
--
-- Context: accept_booking already serialises concurrent accepts via
-- SELECT ... FOR UPDATE + an IF EXISTS same-therapist check + a capacity check
-- (_accepted_count >= guest_count). But direct inserts into booking_therapists
-- (admin create/edit flows) can race with this RPC and violate
-- UNIQUE(booking_id, therapist_id). This adds ON CONFLICT DO NOTHING as
-- defence-in-depth: if the row already exists, return 'already_accepted'
-- instead of letting the unique constraint raise.
--
-- Duo logic is UNCHANGED: two DIFFERENT therapists produce two distinct rows,
-- both inserted; ON CONFLICT only dedupes the SAME (booking_id, therapist_id).

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
