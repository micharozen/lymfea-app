-- Migration: Let venue managers (concierges) manage their venue's therapists
-- Gestion du lieu (Mon lieu) now exposes the Thérapeutes tab to concierges.
-- Concierges may assign / unassign EXISTING therapists to the venues they manage.
-- Creating brand-new therapist accounts stays admin-only (unchanged).
--
-- Scope is always limited to the concierge's own hotels via get_concierge_hotels().
-- These are PERMISSIVE policies; the existing "Admin org isolation" RESTRICTIVE
-- policies let non-admins through (admin_can_access_* returns true when the caller
-- is not an admin), so they do not block concierges.

-- 1. Assign an existing therapist to a hotel the concierge manages.
DROP POLICY IF EXISTS "Concierges can assign therapists to their hotels" ON public.therapist_venues;
CREATE POLICY "Concierges can assign therapists to their hotels"
  ON public.therapist_venues
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  );

-- 2. Unassign a therapist from a hotel the concierge manages.
DROP POLICY IF EXISTS "Concierges can unassign therapists from their hotels" ON public.therapist_venues;
CREATE POLICY "Concierges can unassign therapists from their hotels"
  ON public.therapist_venues
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  );

-- 3. Let concierges see the therapists of their organization so the
--    "assign existing therapist" picker is populated (the baseline concierge
--    SELECT policy only exposes therapists already linked to their own venues,
--    which would leave the picker empty for a single-venue concierge).
--    Scoped to the organization(s) of the concierge's hotels — not global.
--
--    The visibility check lives in a SECURITY DEFINER function so the subquery on
--    therapist_venues / hotels runs WITHOUT triggering their own RLS policies.
--    A plain USING (... EXISTS SELECT FROM therapist_venues ...) would recurse:
--    therapist_venues policies reference therapists, so evaluating this policy
--    would re-enter the therapists policy → "infinite recursion detected in policy"
--    (42P17), breaking every read of therapists (and bookings). This mirrors the
--    existing admin_can_access_therapist() helper.
CREATE OR REPLACE FUNCTION public.concierge_can_view_therapist(_therapist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.therapist_venues tv
      JOIN public.hotels h ON h.id = tv.hotel_id
      WHERE tv.therapist_id = _therapist_id
        AND h.organization_id IS NOT NULL
        AND h.organization_id IN (
          SELECT h2.organization_id
          FROM public.hotels h2
          WHERE h2.id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
        )
    );
$$;

DROP POLICY IF EXISTS "Concierges can view therapists in their organization" ON public.therapists;
CREATE POLICY "Concierges can view therapists in their organization"
  ON public.therapists
  FOR SELECT TO authenticated
  USING (public.concierge_can_view_therapist(id));
