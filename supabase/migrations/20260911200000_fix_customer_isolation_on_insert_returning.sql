-- =========================================================================
-- Correctif : création d'une fiche client refusée par sa propre policy
-- =========================================================================
-- `can_access_customer(id)` relit la ligne dans `customers` pour décider. La
-- policy RESTRICTIVE posée sur `customers` s'auto-référençait donc, ce qui
-- casse `INSERT ... RETURNING` : la fonction est STABLE, elle voit le snapshot
-- d'avant la commande, où la ligne tout juste insérée n'existe pas encore.
-- Elle répond « non » et la policy refuse l'écriture.
--
-- C'est exactement ce que fait PostgREST dès qu'une écriture demande la ligne
-- en retour (`Prefer: return=representation`, le défaut du client Supabase) :
-- toute création de client depuis l'application échouait avec
--   42501 — new row violates row-level security policy "Customer org isolation"
-- alors que le même INSERT sans RETURNING passait.
--
-- Correctif : la policy évalue les colonnes de la ligne courante au lieu de
-- relire la table. Le périmètre appliqué est identique.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.can_access_customer_row(
  _customer_id uuid,
  _organization_id uuid,
  _auth_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Staff Lymfea : accès global.
    public.is_super_admin(auth.uid())

    -- Le client lui-même, via le portail.
    OR _auth_user_id = auth.uid()

    -- Admin ou concierge de l'organisation propriétaire.
    OR _organization_id = public.get_user_org_id(auth.uid())

    -- Praticien : uniquement les clients qu'il a pris en soin. Le rattachement
    -- passe par trois chemins selon le cas (praticien principal, ligne de
    -- soin, roster de diffusion) : les trois sont couverts, sinon la PWA
    -- perdrait l'accès à des fiches légitimes.
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.therapists t ON t.user_id = auth.uid()
      WHERE b.customer_id = _customer_id
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
        )
    )
$$;

COMMENT ON FUNCTION public.can_access_customer_row(uuid, uuid, uuid) IS
  'Cloisonnement des fiches clients, évalué sur les colonnes de la ligne. Ne relit pas `customers` : une policy qui s''auto-référence casse INSERT ... RETURNING.';

GRANT EXECUTE ON FUNCTION public.can_access_customer_row(uuid, uuid, uuid)
  TO authenticated, service_role;

-- Version par identifiant, pour les appels hors policy (diagnostic, RPC).
CREATE OR REPLACE FUNCTION public.can_access_customer(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.can_access_customer_row(c.id, c.organization_id, c.auth_user_id)
  FROM public.customers c
  WHERE c.id = _customer_id
$$;

DROP POLICY IF EXISTS "Customer org isolation" ON public.customers;
CREATE POLICY "Customer org isolation" ON public.customers
  AS RESTRICTIVE TO authenticated
  USING (public.can_access_customer_row(id, organization_id, auth_user_id))
  WITH CHECK (
    -- À l'écriture, on ne peut poser que des fiches de sa propre organisation
    -- (le super-admin garde la main, les flux publics passent par des RPC).
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_org_id(auth.uid())
    OR auth_user_id = auth.uid()
  );
