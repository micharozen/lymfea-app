-- Allow therapists to assign themselves when creating a booking from the PWA.
-- The PWA new-booking flow inserts into booking_therapists with the therapist's
-- own therapists.id and status 'accepted', but no INSERT policy covered the
-- therapist role, causing RLS error 42501.

CREATE POLICY "Therapists can assign themselves to booking_therapists"
  ON public.booking_therapists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM public.therapists t
      WHERE t.id = booking_therapists.therapist_id
        AND t.user_id = auth.uid()
    )
  );
