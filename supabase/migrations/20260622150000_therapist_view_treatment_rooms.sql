-- Migration: allow therapists to read treatment rooms of their venues
-- The PWA planning embeds treatment_rooms(name) on bookings so the therapist
-- can see which room a booking is in. treatment_rooms previously only had
-- SELECT policies for admin and concierge, so the embed returned NULL for
-- therapists. Mirror the existing "Therapists can view treatment menus from
-- their hotels" policy (20260222000008) using therapist_venues.

CREATE POLICY "Therapists can view treatment rooms from their hotels"
  ON public.treatment_rooms FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
  );
