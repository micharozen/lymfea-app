-- Allow concierges to insert accepted therapist assignments when creating bookings directly.

CREATE POLICY "Concierges can create booking_therapists for their hotels"
  ON public.booking_therapists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND status = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_therapists.booking_id
        AND b.hotel_id IN (
          SELECT hotel_id
          FROM public.get_concierge_hotels(auth.uid())
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.therapist_venues tv
      JOIN public.bookings b ON b.id = booking_therapists.booking_id
      WHERE tv.therapist_id = booking_therapists.therapist_id
        AND tv.hotel_id = b.hotel_id
    )
  );
