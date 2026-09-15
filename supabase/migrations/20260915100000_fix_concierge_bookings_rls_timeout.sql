-- =========================================================================
-- Planning concierge : timeout 8 s sur /rest/v1/bookings
-- =========================================================================
-- Symptôme : côté concierge (Hana, Buci, Cap d'Antibes), le planning affiche
-- « Le planning n'a pas pu être chargé ». PostgREST renvoie 500 après ~8 s et
-- Postgres journalise « canceling statement due to statement timeout ».
--
-- Cause : la policy « Customer can read own bookings » filtrait via
--   customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
-- Cette sous-requête est elle-même soumise à la RLS de `customers`. Postgres
-- la planifie en Seq Scan sur les 5 000+ fiches clients en appelant, pour
-- chaque ligne, `can_access_customer_row()` puis, pour un concierge,
-- `customer_has_booking_in_concierge_hotels()` — qui refait un EXISTS sur
-- `bookings` et `amenity_bookings`. Mesuré en production : 4,8 s pour ce seul
-- sous-plan, sur une fenêtre de planning de deux mois.
--
-- Un admin ne le voit pas : `has_role(uid, 'admin')` est le terme le moins
-- coûteux du OR des policies permissives, il est évalué en premier et
-- court-circuite tous les sous-plans (88 ms mesurés). Un concierge, lui,
-- traverse les sous-plans `therapists` (0,4 s) et `customers` (4,8 s) avant
-- d'atteindre son propre terme. Avec les jointures imbriquées du planning
-- (soins, praticiens, salles, `customers(health_notes)`), on dépasse les 8 s.
--
-- Correctif, à périmètre d'accès strictement identique :
--   1. les sous-requêtes qui relisent une table protégée par RLS passent par
--      des fonctions SECURITY DEFINER (`get_customer_ids_for_user`,
--      `get_therapist_id`) : plus de RLS imbriquée, donc plus de Seq Scan ;
--   2. `auth.uid()` est enveloppé dans `(SELECT auth.uid())` pour être hissé
--      en InitPlan au lieu d'être réévalué à chaque ligne ;
--   3. `is_booking_participant()` — une fonction par ligne, sans garde — n'est
--      plus évaluée que pour les praticiens ;
--   4. index sur `customers(auth_user_id)`, qu'aucun index existant ne
--      couvrait seul (seul `(organization_id, auth_user_id)` existait).
-- =========================================================================

-- 1. Fiches clients du compte connecté ------------------------------------
-- SECURITY DEFINER : c'est tout l'objet du correctif. Aucun élargissement
-- d'accès, la policy « Customer can read own profile » autorise déjà le client
-- à lire ses propres fiches. Toutes organisations confondues, comme
-- `get_customer_portal_data` : un client qui fréquente deux établissements y
-- possède deux fiches, et son historique est le sien.
CREATE OR REPLACE FUNCTION public.get_customer_ids_for_user(_user_id uuid)
RETURNS TABLE(customer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.customers c
  WHERE c.auth_user_id = _user_id
    AND _user_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_customer_ids_for_user(uuid) IS
  'Fiches clients rattachées à un compte de connexion, toutes organisations confondues. SECURITY DEFINER : appelée depuis les policies, elle évite une RLS imbriquée sur `customers` (Seq Scan de toute la table à chaque requête).';

GRANT EXECUTE ON FUNCTION public.get_customer_ids_for_user(uuid) TO authenticated, service_role;

-- 2. Policies SELECT de `bookings` ----------------------------------------

DROP POLICY IF EXISTS "Customer can read own bookings" ON public.bookings;
CREATE POLICY "Customer can read own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT customer_id FROM public.get_customer_ids_for_user((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Hairdressers can view their own bookings" ON public.bookings;
CREATE POLICY "Hairdressers can view their own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (therapist_id = public.get_therapist_id((SELECT auth.uid())));

-- `is_booking_participant()` prend l'id de la ligne : elle ne peut pas être
-- hissée hors du filtre et s'exécute donc une fois par réservation, pour tout
-- le monde. La garde de rôle la réserve aux praticiens, seuls concernés.
DROP POLICY IF EXISTS "Therapists can view bookings they joined as secondary" ON public.bookings;
CREATE POLICY "Therapists can view bookings they joined as secondary"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'therapist'::public.app_role)
    AND public.is_booking_participant(id, public.get_therapist_id((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Concierges can view bookings from their hotels" ON public.bookings;
CREATE POLICY "Concierges can view bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role((SELECT auth.uid()), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Therapists can view pending bookings from their hotels" ON public.bookings;
CREATE POLICY "Therapists can view pending bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role((SELECT auth.uid()), 'therapist'::public.app_role)
    AND status = 'pending'::text
    AND (therapist_id IS NULL OR guest_count > 1 OR public.booking_has_open_leg(id))
    AND hotel_id IN (
      SELECT tv.hotel_id
      FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id((SELECT auth.uid()))
    )
    AND NOT (public.get_therapist_id((SELECT auth.uid())) = ANY (COALESCE(declined_by, ARRAY[]::uuid[])))
  );

-- 3. Index ----------------------------------------------------------------
-- `customers_org_auth_user_id_key` est préfixé par `organization_id` : il ne
-- sert pas une recherche par `auth_user_id` seul.
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id
  ON public.customers (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
