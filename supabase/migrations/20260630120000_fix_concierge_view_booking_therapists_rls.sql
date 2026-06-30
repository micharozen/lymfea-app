-- Fix: concierges could not read booking_therapists rows, so duo bookings showed
-- "Duo 0/2" on the concierge planning while admins correctly saw "Duo 2/2".
--
-- The original SELECT policy compared concierge_hotels.concierge_id directly to
-- auth.uid(), but concierge_hotels.concierge_id references concierges.id (not the
-- auth user id). The auth user is mapped via concierges.user_id. The comparison
-- therefore never matched and the embedded booking_therapists join returned [].
--
-- Align this policy with the bookings SELECT policy and the booking_therapists
-- INSERT policy, which both resolve the concierge's hotels via get_concierge_hotels().

DROP POLICY IF EXISTS "Concierges can view booking_therapists for their hotels"
  ON public.booking_therapists;

CREATE POLICY "Concierges can view booking_therapists for their hotels"
  ON public.booking_therapists
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_therapists.booking_id
        AND b.hotel_id IN (
          SELECT hotel_id
          FROM public.get_concierge_hotels(auth.uid())
        )
    )
  );
