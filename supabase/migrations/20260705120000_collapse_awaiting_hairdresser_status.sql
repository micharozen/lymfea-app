-- Migration: Collapse 'awaiting_hairdresser_selection' into 'pending'
--
-- Context:
--   Duo bookings (guest_count > 1) used to sit in a dedicated
--   'awaiting_hairdresser_selection' status between "first therapist accepted"
--   and "fully staffed". This status was overloaded: it also drove RLS
--   visibility and the client confirmation screen (which wrongly showed
--   "Confirmée" because it did not recognise the status as pending).
--
--   We remove the status entirely. A duo that still needs more therapists is
--   now simply status = 'pending' AND guest_count > 1. A fully staffed duo
--   becomes 'confirmed' (unchanged), so a 'pending' booking with guest_count > 1
--   is BY DEFINITION still open — even after the first acceptor set therapist_id.
--
-- Replacement rule applied everywhere:
--   status = 'awaiting_hairdresser_selection'
--     -> status = 'pending' AND guest_count > 1
--   status IN ('pending','awaiting_hairdresser_selection')
--     -> status = 'pending'

-- ============================================================
-- 1. DATA — migrate existing rows
-- ============================================================
UPDATE bookings
SET status = 'pending'
WHERE status = 'awaiting_hairdresser_selection';

-- ============================================================
-- 2. accept_booking — intermediate state is now 'pending'
-- ============================================================
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

  -- Insert into bridge table
  INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
  VALUES (_booking_id, _hairdresser_id, 'accepted', now());

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

-- ============================================================
-- 3. RLS — re-derive "still open" from (pending + guest_count)
-- ============================================================

-- bookings: pending list (solo unassigned OR any open duo)
DROP POLICY IF EXISTS "Therapists can view pending bookings from their hotels" ON public.bookings;
CREATE POLICY "Therapists can view pending bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status = 'pending'
    AND (
      therapist_id IS NULL
      OR guest_count > 1
    )
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
    AND NOT (public.get_therapist_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
  );

-- booking_therapists: let therapist B see the "1/2" count on an open duo
DROP POLICY IF EXISTS "Therapists can view booking_therapists for awaiting bookings at" ON public.booking_therapists;
CREATE POLICY "Therapists can view booking_therapists for awaiting bookings at"
  ON public.booking_therapists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      INNER JOIN public.therapist_venues tv ON tv.hotel_id = b.hotel_id
      WHERE b.id = booking_therapists.booking_id
        AND b.status = 'pending'
        AND b.guest_count > 1
        AND tv.therapist_id = public.get_therapist_id(auth.uid())
        AND NOT (
          public.get_therapist_id(auth.uid()) = ANY(COALESCE(b.declined_by, ARRAY[]::uuid[]))
        )
    )
  );

-- booking_treatments SELECT: mirror the bookings visibility rule
DROP POLICY IF EXISTS "Therapists can view treatments for pending bookings" ON public.booking_treatments;
CREATE POLICY "Therapists can view treatments for pending bookings"
  ON public.booking_treatments FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status = 'pending'
        AND (
          b.therapist_id IS NULL
          OR b.guest_count > 1
        )
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

-- booking_treatments INSERT: only bookings with no therapist assigned yet
DROP POLICY IF EXISTS "Therapists can create treatments for pending bookings in thei" ON public.booking_treatments;
CREATE POLICY "Therapists can create treatments for pending bookings in thei"
  ON public.booking_treatments FOR INSERT
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status = 'pending'
        AND b.therapist_id IS NULL
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

-- booking_treatments DELETE: same restriction as INSERT
DROP POLICY IF EXISTS "Therapists can delete treatments for pending bookings in thei" ON public.booking_treatments;
CREATE POLICY "Therapists can delete treatments for pending bookings in thei"
  ON public.booking_treatments FOR DELETE
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status = 'pending'
        AND b.therapist_id IS NULL
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );
