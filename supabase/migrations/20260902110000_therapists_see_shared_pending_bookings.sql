-- ==============================================================================
-- Migration : therapists_see_shared_pending_bookings
-- Description : rendre visible une réservation partagée aux praticiens qui
--               peuvent encore la rejoindre (issue #547).
--
--   Depuis le partage d'un booking simple, une réservation reste 'pending' avec
--   une jambe libre alors que `bookings.therapist_id` nomme déjà le premier
--   praticien arrivé. Les policies de lecture n'ouvraient le 'pending' qu'aux
--   réservations sans praticien (`therapist_id IS NULL`) ou aux duos
--   (`guest_count > 1`) : la jambe restante n'était donc proposée à PERSONNE.
--   La réservation restait bloquée en attente, invisible pour le seul praticien
--   capable de la terminer, alors qu'`accept_booking` l'accepte très bien.
--
--   `booking_has_open_leg` lit les jambes comme `accept_booking` les réclame :
--   soins de base, hors add-ons et hors commodités (une commodité ne mobilise
--   aucun praticien). Elle est SECURITY DEFINER pour que les policies n'aient
--   pas à traverser la RLS de `booking_treatments`.
--
--   Les trois tables lues par la carte « demandes en attente » sont élargies de
--   la même façon : la réservation, ses prestations (ce qui reste à pourvoir) et
--   son équipe (qui a déjà accepté).
--
--   Miroir déclaratif : supabase/schemas/80_functions.sql et 90_policies.sql.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.booking_has_open_leg(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Partagée = au moins une jambe libre ET au moins une jambe déjà attribuée.
  -- Exiger la seconde condition protège les réservations historiques, dont
  -- aucune ligne ne porte de therapist_id alors que le praticien principal
  -- assure tout : sans elle, un tiers pourrait s'y inviter.
  SELECT COUNT(*) FILTER (WHERE bt.therapist_id IS NULL) > 0
     AND COUNT(*) FILTER (WHERE bt.therapist_id IS NOT NULL) > 0
  FROM booking_treatments bt
  JOIN treatment_menus tm ON tm.id = bt.treatment_id
  WHERE bt.booking_id = _booking_id
    AND bt.is_addon = false
    AND tm.amenity_id IS NULL;
$$;

ALTER FUNCTION public.booking_has_open_leg(uuid) OWNER TO postgres;

DROP POLICY IF EXISTS "Therapists can view pending bookings from their hotels" ON public.bookings;
CREATE POLICY "Therapists can view pending bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status = 'pending'
    AND (
      therapist_id IS NULL
      OR guest_count > 1
      OR public.booking_has_open_leg(id)
    )
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
    AND NOT (public.get_therapist_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
  );

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
          OR public.booking_has_open_leg(b.id)
        )
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Therapists can view booking_therapists for awaiting bookings at" ON public.booking_therapists;
CREATE POLICY "Therapists can view booking_therapists for awaiting bookings at"
  ON public.booking_therapists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.therapist_venues tv ON tv.hotel_id = b.hotel_id
      WHERE b.id = booking_therapists.booking_id
        AND b.status = 'pending'
        AND (b.guest_count > 1 OR public.booking_has_open_leg(b.id))
        AND tv.therapist_id = public.get_therapist_id(auth.uid())
        AND NOT (public.get_therapist_id(auth.uid()) = ANY(COALESCE(b.declined_by, ARRAY[]::uuid[])))
    )
  );
