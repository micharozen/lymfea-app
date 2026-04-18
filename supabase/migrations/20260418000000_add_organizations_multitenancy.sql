-- =========================================================================
-- Multi-tenancy Organizations Layer
-- =========================================================================
-- Introduces an `organizations` table to scope admins (and their data) to a
-- specific hotel group. The existing `admin` role is refined via a new
-- `is_super_admin` flag on the `admins` table:
--   - super-admins (Lymfea staff)  : see every organization (current behavior)
--   - org-admins (hotel groups)    : scoped to `organization_id`
-- All data isolation is enforced through RLS policies. Non-admin roles
-- (therapist, concierge, anon, authenticated) are unaffected.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. organizations table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  contact_email text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 2. hotels.organization_id + admins.{is_super_admin, organization_id}
-- -------------------------------------------------------------------------

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_hotels_organization_id ON public.hotels(organization_id);

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_admins_organization_id ON public.admins(organization_id);

-- -------------------------------------------------------------------------
-- 3. Helper RPC functions
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = _user_id AND is_super_admin = true
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.admins WHERE user_id = _user_id LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 4. Seed Lymfea Default organization + backfill existing data
-- -------------------------------------------------------------------------

INSERT INTO public.organizations (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Lymfea Default', 'lymfea-default')
ON CONFLICT (id) DO NOTHING;

UPDATE public.hotels
SET organization_id = 'a0000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Every existing admin becomes a super-admin (current behavior preserved).
UPDATE public.admins
SET is_super_admin = true
WHERE is_super_admin = false;

-- Harden hotels: every hotel MUST belong to an organization.
ALTER TABLE public.hotels ALTER COLUMN organization_id SET NOT NULL;

-- -------------------------------------------------------------------------
-- 5. Foreign keys on pre-existing orphan organization_id columns
-- -------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_ledger_organization_id_fkey'
  ) THEN
    ALTER TABLE public.hotel_ledger
      ADD CONSTRAINT hotel_ledger_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'therapist_payouts_organization_id_fkey'
  ) THEN
    ALTER TABLE public.therapist_payouts
      ADD CONSTRAINT therapist_payouts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 6. RLS on organizations
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Super admins manage organizations" ON public.organizations;
CREATE POLICY "Super admins manage organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins can view their organization" ON public.organizations;
CREATE POLICY "Org admins can view their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND id = public.get_user_organization_id(auth.uid())
  );

DROP POLICY IF EXISTS "Block anonymous access to organizations" ON public.organizations;
CREATE POLICY "Block anonymous access to organizations" ON public.organizations
  AS RESTRICTIVE TO anon USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

-- -------------------------------------------------------------------------
-- 7. Explicit rewrite of `admins` policies (complex logic: org-admins can
--    invite within their org but cannot escalate to super-admin)
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view all admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can create admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can update admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can delete admins" ON public.admins;

CREATE POLICY "Admins can view admins (org scoped)" ON public.admins
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Admins can insert admins (org scoped)" ON public.admins
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR (
        organization_id = public.get_user_organization_id(auth.uid())
        AND is_super_admin = false
      )
    )
  );

CREATE POLICY "Admins can update admins (org scoped)" ON public.admins
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR (
        organization_id = public.get_user_organization_id(auth.uid())
        AND is_super_admin = false
      )
    )
  );

CREATE POLICY "Super admins can delete admins" ON public.admins
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_super_admin(auth.uid())
  );

-- -------------------------------------------------------------------------
-- 8. Explicit rewrite of `hotels` admin policies (uses organization_id
--    directly on the row, not via hotel_id)
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view all hotels" ON public.hotels;
DROP POLICY IF EXISTS "Admins can create hotels" ON public.hotels;
DROP POLICY IF EXISTS "Admins can update hotels" ON public.hotels;
DROP POLICY IF EXISTS "Admins can delete hotels" ON public.hotels;

CREATE POLICY "Admins can view hotels (org scoped)" ON public.hotels
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Admins can create hotels (org scoped)" ON public.hotels
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Admins can update hotels (org scoped)" ON public.hotels
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Admins can delete hotels (org scoped)" ON public.hotels
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- -------------------------------------------------------------------------
-- 9. RESTRICTIVE overlay for tables with hotel_id (org-scoping)
--    Rationale: rather than rewriting every existing admin policy (~60),
--    we add a single RESTRICTIVE policy per table that enforces:
--      "if acting as admin, you must pass the org check too"
--    Non-admins (therapist, concierge, anon) pass trivially via
--    `NOT has_role(... 'admin')`, so their existing policies are untouched.
-- -------------------------------------------------------------------------

-- Helper: returns true if the user is allowed to access rows scoped to this
-- hotel_id. Super-admins always pass. Org-admins pass only for hotels of
-- their organization. Non-admins always pass (this function is only used
-- inside RESTRICTIVE policies that gate admin-only access).
CREATE OR REPLACE FUNCTION public.admin_can_access_hotel(_hotel_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.hotels h
      WHERE h.id = _hotel_id
      AND h.organization_id = public.get_user_organization_id(auth.uid())
    )
$$;

GRANT EXECUTE ON FUNCTION public.admin_can_access_hotel(text) TO authenticated, service_role;

-- Apply the RESTRICTIVE overlay to every table that has a `hotel_id` column
-- and is accessed by admins. Each policy gates ALL commands (SELECT/INSERT/
-- UPDATE/DELETE) for the admin role, leaving other roles untouched.
DO $$
DECLARE
  tbl text;
  tables_with_hotel_id text[] := ARRAY[
    'bookings',
    'treatment_menus',
    'treatment_categories',
    'treatment_rooms',
    'treatment_bundles',
    'treatment_addons',
    'therapist_venues',
    'therapist_schedule_templates',
    'hotel_ledger',
    'concierge_hotels',
    'venue_deployment_schedules',
    'venue_blocked_slots',
    'push_notification_logs',
    'client_analytics',
    'notifications',
    'customers',
    'treatment_packages',
    'gift_cards'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_hotel_id LOOP
    -- Only apply if the table exists AND has a hotel_id column (safe for
    -- future/removed tables).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'hotel_id'
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        'Admin org isolation', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I '
        'AS RESTRICTIVE TO authenticated '
        'USING (public.admin_can_access_hotel(hotel_id)) '
        'WITH CHECK (public.admin_can_access_hotel(hotel_id))',
        'Admin org isolation', tbl
      );
    END IF;
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 10. RESTRICTIVE overlay for tables scoped via a nested foreign key
--     (e.g. booking_treatments.booking_id → bookings.hotel_id).
-- -------------------------------------------------------------------------

-- booking_treatments: scoped via booking_id → bookings.hotel_id
CREATE OR REPLACE FUNCTION public.admin_can_access_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.hotels h ON h.id = b.hotel_id
      WHERE b.id = _booking_id
      AND h.organization_id = public.get_user_organization_id(auth.uid())
    )
$$;

GRANT EXECUTE ON FUNCTION public.admin_can_access_booking(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin org isolation" ON public.booking_treatments;
CREATE POLICY "Admin org isolation" ON public.booking_treatments
  AS RESTRICTIVE TO authenticated
  USING (public.admin_can_access_booking(booking_id))
  WITH CHECK (public.admin_can_access_booking(booking_id));

-- booking_alternative_proposals: same pattern (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_alternative_proposals'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin org isolation" ON public.booking_alternative_proposals';
    EXECUTE 'CREATE POLICY "Admin org isolation" ON public.booking_alternative_proposals '
            'AS RESTRICTIVE TO authenticated '
            'USING (public.admin_can_access_booking(booking_id)) '
            'WITH CHECK (public.admin_can_access_booking(booking_id))';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 11. Therapists: scoped via therapist_venues (therapists can serve multiple
--     hotels, possibly across orgs — an admin can see/manage a therapist if
--     ANY of their venues is in the admin's org).
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_can_access_therapist(_therapist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.therapist_venues tv
      JOIN public.hotels h ON h.id = tv.hotel_id
      WHERE tv.therapist_id = _therapist_id
      AND h.organization_id = public.get_user_organization_id(auth.uid())
    )
$$;

GRANT EXECUTE ON FUNCTION public.admin_can_access_therapist(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin org isolation" ON public.therapists;
CREATE POLICY "Admin org isolation" ON public.therapists
  AS RESTRICTIVE TO authenticated
  USING (public.admin_can_access_therapist(id))
  WITH CHECK (public.admin_can_access_therapist(id));

-- therapist_payouts: scoped via therapist_id (org-specific)
DROP POLICY IF EXISTS "Admin org isolation" ON public.therapist_payouts;
CREATE POLICY "Admin org isolation" ON public.therapist_payouts
  AS RESTRICTIVE TO authenticated
  USING (public.admin_can_access_therapist(therapist_id))
  WITH CHECK (public.admin_can_access_therapist(therapist_id));

-- therapist_ratings: scoped via booking_id (safer than therapist_id here,
-- because a rating belongs to one specific booking in one hotel).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'therapist_ratings' AND column_name = 'booking_id'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin org isolation" ON public.therapist_ratings';
    EXECUTE 'CREATE POLICY "Admin org isolation" ON public.therapist_ratings '
            'AS RESTRICTIVE TO authenticated '
            'USING (public.admin_can_access_booking(booking_id)) '
            'WITH CHECK (public.admin_can_access_booking(booking_id))';
  END IF;
END $$;

-- therapist_absences: scoped via therapist_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'therapist_absences'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin org isolation" ON public.therapist_absences';
    EXECUTE 'CREATE POLICY "Admin org isolation" ON public.therapist_absences '
            'AS RESTRICTIVE TO authenticated '
            'USING (public.admin_can_access_therapist(therapist_id)) '
            'WITH CHECK (public.admin_can_access_therapist(therapist_id))';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 12. Concierges: scoped via concierge_hotels (same pattern as therapists)
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_can_access_concierge(_concierge_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.concierge_hotels ch
      JOIN public.hotels h ON h.id = ch.hotel_id
      WHERE ch.concierge_id = _concierge_id
      AND h.organization_id = public.get_user_organization_id(auth.uid())
    )
$$;

GRANT EXECUTE ON FUNCTION public.admin_can_access_concierge(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin org isolation" ON public.concierges;
CREATE POLICY "Admin org isolation" ON public.concierges
  AS RESTRICTIVE TO authenticated
  USING (public.admin_can_access_concierge(id))
  WITH CHECK (public.admin_can_access_concierge(id));

-- -------------------------------------------------------------------------
-- 13. updated_at trigger for organizations
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.organizations IS 'Hotel groups / tenants — scopes admins and their data';
COMMENT ON COLUMN public.admins.is_super_admin IS 'Lymfea staff (sees every organization)';
COMMENT ON COLUMN public.admins.organization_id IS 'Organization the admin is scoped to (null only for super-admins before migration)';
COMMENT ON COLUMN public.hotels.organization_id IS 'Owning organization (tenant) for this hotel';
