-- Les thérapeutes ne pouvaient voir un lieu que s'ils y avaient déjà une réservation.
-- Un lieu fraîchement assigné (therapist_venues) restait donc invisible dans la PWA
-- (page « Mes hôtels », qui lit therapist_venues puis hotels).
-- On autorise la lecture des lieux auxquels le thérapeute est rattaché.

DROP POLICY IF EXISTS "Therapists can view their assigned hotels" ON public.hotels;

CREATE POLICY "Therapists can view their assigned hotels"
ON public.hotels
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'therapist'::app_role)
  AND id IN (
    SELECT tv.hotel_id
    FROM public.therapist_venues tv
    WHERE tv.therapist_id = get_therapist_id(auth.uid())
  )
);
