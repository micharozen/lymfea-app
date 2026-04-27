-- RLS pour les soins duo (deux thérapeutes sur un même booking).
--
-- Contexte :
--   Un soin duo crée un booking principal (guest_count > 1) dont le statut
--   passe à 'awaiting_hairdresser_selection' dès qu'un premier thérapeute
--   accepte. Un second thérapeute du même hôtel doit :
--     (a) continuer à voir le booking dans sa liste "en attente"
--     (b) voir le compte correct d'acceptations (ex. "1/2")
--   La table booking_therapists (bridge) enregistre chaque thérapeute ayant
--   accepté ou refusé.
--
-- Structure :
--   1. Fonction helper SECURITY DEFINER (évite la récursion RLS infinie)
--   2. Policies booking_therapists
--   3. Policies bookings
--   4. Policies booking_treatments

-- ============================================================
-- 1. FONCTION HELPER
-- ============================================================
-- Vérifie qu'un thérapeute a ACCEPTÉ (status = 'accepted') un booking.
-- SECURITY DEFINER : lit booking_therapists sans passer par RLS,
-- ce qui évite la récursion infinie quand une policy bookings appelle
-- cette fonction qui à son tour lirait bookings.

CREATE OR REPLACE FUNCTION is_booking_participant(_booking_id uuid, _therapist_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM booking_therapists
    WHERE booking_id = _booking_id
      AND therapist_id = _therapist_id
      AND status = 'accepted'
  );
$$;

GRANT EXECUTE ON FUNCTION is_booking_participant(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. POLICIES — booking_therapists
-- ============================================================

-- Nettoyage (idempotent)
DROP POLICY IF EXISTS "Therapists can view their own assignments"           ON booking_therapists;
DROP POLICY IF EXISTS "Therapists can view assignments for their bookings"  ON booking_therapists;
DROP POLICY IF EXISTS "Therapists can view booking_therapists for awaiting bookings at their hotels" ON booking_therapists;

-- A. Un thérapeute accepté peut voir toutes les lignes du bridge pour son booking.
--    (lui permet de savoir qui d'autre a accepté)
CREATE POLICY "Therapists can view assignments for their bookings"
  ON booking_therapists FOR SELECT
  TO authenticated
  USING (
    is_booking_participant(booking_id, get_therapist_id(auth.uid()))
  );

-- B. Un thérapeute peut voir les lignes du bridge pour les bookings duo en
--    attente dans son hôtel — même s'il n'a pas encore accepté.
--    Nécessaire pour afficher "1/2" au lieu de "0/2" dans la liste pending.
--    Les conditions sont identiques à la policy "pending" sur bookings,
--    donc aucune donnée supplémentaire n'est exposée.
CREATE POLICY "Therapists can view booking_therapists for awaiting bookings at their hotels"
  ON booking_therapists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM bookings b
      INNER JOIN therapist_venues tv ON tv.hotel_id = b.hotel_id
      WHERE b.id = booking_therapists.booking_id
        AND b.status = 'awaiting_hairdresser_selection'
        AND tv.therapist_id = get_therapist_id(auth.uid())
        AND NOT (
          get_therapist_id(auth.uid()) = ANY(COALESCE(b.declined_by, ARRAY[]::uuid[]))
        )
    )
  );

-- ============================================================
-- 3. POLICIES — bookings
-- ============================================================

-- Nettoyage (idempotent)
DROP POLICY IF EXISTS "Therapists can view pending bookings from their hotels"     ON public.bookings;
DROP POLICY IF EXISTS "Therapists can view bookings they joined as secondary"      ON public.bookings;

-- A. Liste "en attente" : soins sans thérapeute OU soins duo dont un premier
--    thérapeute vient d'accepter (therapist_id est alors renseigné mais
--    le booking doit rester visible pour les autres thérapeutes du même hôtel).
CREATE POLICY "Therapists can view pending bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status IN ('pending', 'awaiting_hairdresser_selection')
    AND (
      therapist_id IS NULL
      OR (status = 'awaiting_hairdresser_selection' AND guest_count > 1)
    )
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
    AND NOT (public.get_therapist_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
  );

-- B. Un thérapeute accepté comme praticien secondaire peut lire le booking complet.
CREATE POLICY "Therapists can view bookings they joined as secondary"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    is_booking_participant(id, get_therapist_id(auth.uid()))
  );

-- ============================================================
-- 4. POLICIES — booking_treatments
-- ============================================================

-- Nettoyage (idempotent)
DROP POLICY IF EXISTS "Therapists can view treatments for pending bookings"              ON public.booking_treatments;
DROP POLICY IF EXISTS "Therapists can create treatments for pending bookings in thei"    ON public.booking_treatments;
DROP POLICY IF EXISTS "Therapists can delete treatments for pending bookings in thei"    ON public.booking_treatments;

-- A. SELECT : étendu aux bookings duo en attente pour que le thérapeute B
--    puisse voir les soins du booking avant d'accepter.
CREATE POLICY "Therapists can view treatments for pending bookings"
  ON public.booking_treatments FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND (
          b.therapist_id IS NULL
          OR (b.status = 'awaiting_hairdresser_selection' AND b.guest_count > 1)
        )
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

-- B. INSERT : strictement réservé aux bookings sans aucun thérapeute assigné.
--    Un thérapeute qui voit un soin duo (mais ne l'a pas encore accepté)
--    ne doit pas pouvoir modifier les soins prescrits.
CREATE POLICY "Therapists can create treatments for pending bookings in thei"
  ON public.booking_treatments FOR INSERT
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND b.therapist_id IS NULL
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

-- C. DELETE : même restriction que INSERT.
CREATE POLICY "Therapists can delete treatments for pending bookings in thei"
  ON public.booking_treatments FOR DELETE
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND b.therapist_id IS NULL
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );
