-- Duo : le thérapeute secondaire voit la réservation (policy
-- "Therapists can view bookings they joined as secondary" sur bookings) mais
-- pas ses booking_treatments — les policies existantes exigent soit d'être le
-- thérapeute principal (bookings.therapist_id), soit un statut 'pending'.
-- Résultat sur un duo confirmé : l'embed booking_treatments revient vide et la
-- carte PWA affiche un soin sans nom, alors qu'un booking simple l'affiche.
--
-- On aligne booking_treatments sur bookings avec la même règle de participation.

-- Rejouable : la policy a été posée à la main sur la prod pendant le
-- diagnostic, avant que cette migration n'y soit appliquée. Sans le DROP,
-- `supabase db push` échouerait sur un CREATE POLICY déjà existant.
DROP POLICY IF EXISTS "Therapists can view treatments for bookings they joined"
ON public.booking_treatments;

CREATE POLICY "Therapists can view treatments for bookings they joined"
ON public.booking_treatments
FOR SELECT
TO authenticated
USING (
  public.is_booking_participant(booking_id, public.get_therapist_id(auth.uid()))
);
