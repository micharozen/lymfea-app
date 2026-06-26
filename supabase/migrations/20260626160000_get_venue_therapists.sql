-- Allow a venue's therapists to list their colleagues so a PWA booking
-- can be assigned to another therapist of the same venue.
-- Direct SELECT on `therapists` is restricted by RLS to the caller's own
-- profile, so we expose a SECURITY DEFINER function scoped to the venue.

CREATE OR REPLACE FUNCTION public.get_venue_therapists(_hotel_id text)
RETURNS TABLE("id" uuid, "first_name" text, "last_name" text, "profile_image" text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT t.id, t.first_name, t.last_name, t.profile_image
  FROM public.therapists t
  INNER JOIN public.therapist_venues tv ON t.id = tv.therapist_id
  WHERE tv.hotel_id = _hotel_id
    AND t.status IN ('Active', 'Actif', 'active')
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'concierge'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.therapist_venues tv2
        INNER JOIN public.therapists me ON me.id = tv2.therapist_id
        WHERE tv2.hotel_id = _hotel_id AND me.user_id = auth.uid()
      )
    )
  ORDER BY t.first_name, t.last_name;
$$;

GRANT ALL ON FUNCTION public.get_venue_therapists(text) TO authenticated, service_role;

-- ============================================================================
-- RLS for the "assign to another therapist" PWA flow.
-- The existing INSERT policies only cover the case where the booking is
-- assigned to the CALLER. When a therapist assigns a booking to a colleague of
-- the same venue, both booking_treatments and booking_therapists inserts are
-- rejected. The policies below add venue-scoped permissions (OR'd with the
-- existing self-only policies, which stay in place for the default case).
-- ============================================================================

-- booking_treatments: allow inserting treatments for a booking located at one
-- of the caller's venues, regardless of which therapist it is assigned to.
CREATE POLICY "Therapists can create treatments for venue bookings"
  ON public.booking_treatments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.hotel_id IN (
        SELECT tv.hotel_id FROM public.therapist_venues tv
        WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
      )
    )
  );

-- bookings SELECT: a therapist may view bookings at one of their own venues.
-- Required so that creating a booking assigned to a COLLEAGUE works: the
-- INSERT ... RETURNING used by the mutation is filtered by the SELECT policy,
-- and without this the caller cannot read back a booking assigned to someone
-- else. Mirrors the existing concierge "view bookings from their hotels" model.
CREATE POLICY "Therapists can view bookings at their venues"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
  );

-- Helper: does the caller AND a target therapist both belong to the venue of a
-- given booking? SECURITY DEFINER so it bypasses RLS on therapist_venues /
-- bookings — a therapist can only SELECT their OWN therapist_venues row, so an
-- inline policy subquery could not see the COLLEAGUE's membership row and would
-- always fail. The function still authorizes only the calling therapist
-- (get_therapist_id(auth.uid())) as a venue member.
CREATE OR REPLACE FUNCTION public.can_assign_therapist_to_booking(
  _booking_id uuid,
  _target_therapist_id uuid
)
RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    INNER JOIN public.therapist_venues tv_me     ON tv_me.hotel_id = b.hotel_id
    INNER JOIN public.therapist_venues tv_target ON tv_target.hotel_id = b.hotel_id
    WHERE b.id = _booking_id
      AND tv_me.therapist_id = public.get_therapist_id(auth.uid())
      AND tv_target.therapist_id = _target_therapist_id
  );
$$;

GRANT ALL ON FUNCTION public.can_assign_therapist_to_booking(uuid, uuid) TO authenticated, service_role;

-- booking_therapists: allow assigning a colleague (another therapist of the
-- same venue). Caller must belong to the booking's venue AND the target
-- therapist must belong to that same venue (checked via the SECURITY DEFINER
-- helper above to avoid the RLS-within-RLS trap).
CREATE POLICY "Therapists can assign venue colleagues to booking_therapists"
  ON public.booking_therapists FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status = 'accepted'
    AND public.can_assign_therapist_to_booking(
      booking_therapists.booking_id,
      booking_therapists.therapist_id
    )
  );
