-- =========================================================================
-- Fiches clients : RLS évaluée ligne par ligne
-- =========================================================================
-- Même classe de défaut que 20260915100000, sur la table `customers` cette
-- fois. Deux policies appellent une fonction qui prend l'identifiant de la
-- ligne : elles ne peuvent donc pas être hissées et s'exécutent une fois par
-- fiche. Mesuré en production pour un concierge, sur 5 116 fiches :
--
--   can_access_customer_row(id, organization_id, auth_user_id) ... 1 030 ms
--   customer_has_booking_in_concierge_hotels(id, auth.uid()) .....   357 ms
--   total de la liste clients ..................................  1 723 ms
--
-- Le pic déjà observé sur /rest/v1/customers est à 8 020 ms, soit le plafond
-- du statement timeout : la liste des clients est la prochaine à tomber.
--
-- Le coût vient du chemin praticien de `can_access_customer_row` : pour un
-- concierge, les fiches hors de son organisation n'ont pas de sortie rapide et
-- déclenchent chacune un EXISTS sur `bookings`. Idem pour la policy concierge,
-- dont l'EXISTS repart sur `bookings` puis `amenity_bookings` à chaque ligne.
--
-- Correctif, à périmètre d'accès strictement identique : les deux tests par
-- ligne deviennent des ensembles calculés une seule fois (sous-plan haché),
-- via des fonctions SECURITY DEFINER, et `auth.uid()` est hissé en InitPlan.
-- Les branches coûteuses restent gardées par un test scalaire, pour n'être
-- évaluées que par le rôle concerné.
-- =========================================================================

-- 1. Clients rattachés aux établissements d'un concierge ------------------
-- Équivalent ensembliste de `customer_has_booking_in_concierge_hotels`, qui
-- posait la même question fiche par fiche.
CREATE OR REPLACE FUNCTION public.get_concierge_customer_ids(_user_id uuid)
RETURNS TABLE(customer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.customer_id
  FROM public.bookings b
  WHERE b.customer_id IS NOT NULL
    AND b.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(_user_id))
  UNION
  SELECT a.customer_id
  FROM public.amenity_bookings a
  WHERE a.customer_id IS NOT NULL
    AND a.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(_user_id));
$$;

COMMENT ON FUNCTION public.get_concierge_customer_ids(uuid) IS
  'Clients ayant une réservation (soin ou commodité) dans les établissements d''un concierge. Version ensembliste de customer_has_booking_in_concierge_hotels, pour être calculée une fois par requête au lieu d''une fois par fiche.';

GRANT EXECUTE ON FUNCTION public.get_concierge_customer_ids(uuid) TO authenticated, service_role;

-- 2. Clients pris en soin par un praticien --------------------------------
-- Les trois rattachements possibles sont conservés : praticien principal de la
-- réservation, ligne de soin, roster de diffusion. En retirer un ferait perdre
-- à la PWA l'accès à des fiches légitimes.
CREATE OR REPLACE FUNCTION public.get_therapist_customer_ids(_user_id uuid)
RETURNS TABLE(customer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT b.customer_id
  FROM public.bookings b
  JOIN public.therapists t ON t.user_id = _user_id
  WHERE b.customer_id IS NOT NULL
    AND (
      b.therapist_id = t.id
      OR EXISTS (
        SELECT 1 FROM public.booking_treatments bt
        WHERE bt.booking_id = b.id AND bt.therapist_id = t.id
      )
      OR EXISTS (
        SELECT 1 FROM public.booking_therapists bth
        WHERE bth.booking_id = b.id AND bth.therapist_id = t.id
      )
    );
$$;

COMMENT ON FUNCTION public.get_therapist_customer_ids(uuid) IS
  'Clients qu''un praticien a pris en soin, par l''un des trois rattachements (praticien principal, ligne de soin, roster). Version ensembliste du chemin praticien de can_access_customer_row.';

GRANT EXECUTE ON FUNCTION public.get_therapist_customer_ids(uuid) TO authenticated, service_role;

-- 3. Cloisonnement des fiches (policy RESTRICTIVE) ------------------------
-- La règle est désormais écrite dans la policy plutôt qu'appelée par ligne.
-- L'ordre des termes place devant les tests scalaires, hissés en InitPlan :
-- un admin ou un concierge sort sur son organisation sans jamais déclencher
-- le sous-plan praticien.
--
-- Comme la version précédente, la policy n'interroge jamais `customers` : elle
-- ne lit que les colonnes de la ligne courante. C'est ce qui permet à
-- `INSERT ... RETURNING` de fonctionner (cf. 20260911200000) — toute
-- réécriture future doit préserver cette propriété.
DROP POLICY IF EXISTS "Customer org isolation" ON public.customers;
CREATE POLICY "Customer org isolation"
  ON public.customers AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    -- Le client lui-même, via le portail.
    auth_user_id = (SELECT auth.uid())
    -- Admin ou concierge de l'organisation propriétaire.
    OR organization_id = (SELECT public.get_user_org_id((SELECT auth.uid())))
    -- Staff Lymfea : accès global.
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
    -- Praticien : uniquement les clients qu'il a pris en soin. Le test
    -- scalaire évite de construire l'ensemble pour les autres rôles.
    OR (
      (SELECT public.get_therapist_id((SELECT auth.uid()))) IS NOT NULL
      AND id IN (
        SELECT customer_id FROM public.get_therapist_customer_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR organization_id = (SELECT public.get_user_org_id((SELECT auth.uid())))
    OR auth_user_id = (SELECT auth.uid())
  );

COMMENT ON FUNCTION public.can_access_customer_row(uuid, uuid, uuid) IS
  'Cloisonnement des fiches clients, évalué sur les colonnes de la ligne. La policy « Customer org isolation » écrit désormais la même règle en clair, pour être hissée en InitPlan ; cette fonction reste la version appelable hors policy (RPC, diagnostic) — garder les deux d''accord.';

-- 4. Lecture concierge (policy PERMISSIVE) --------------------------------
DROP POLICY IF EXISTS "Concierges can view customers from their hotels" ON public.customers;
CREATE POLICY "Concierges can view customers from their hotels"
  ON public.customers FOR SELECT
  USING (
    public.has_role((SELECT auth.uid()), 'concierge'::public.app_role)
    AND id IN (
      SELECT customer_id FROM public.get_concierge_customer_ids((SELECT auth.uid()))
    )
  );
