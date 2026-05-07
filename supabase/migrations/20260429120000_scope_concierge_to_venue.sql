-- Scope concierge access strictly to their assigned hotels.
--
-- Before this migration, several tables had RLS policies that granted any
-- concierge access to ALL rows (filter was just has_role('concierge')), which
-- leaked customer / bundle / analytics data across venues.
--
-- This migration tightens those policies so a concierge only sees rows tied
-- to a hotel returned by public.get_concierge_hotels(auth.uid()).
-- Admin policies are intentionally left untouched.

-- =============================================================
-- 1. customers — scope via existence of a booking in one of my hotels
-- =============================================================
DROP POLICY IF EXISTS "Concierges can view customers" ON public.customers;

CREATE POLICY "Concierges can view customers from their hotels"
  ON public.customers FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.customer_id = customers.id
        AND b.hotel_id IN (
          SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
        )
    )
  );

-- =============================================================
-- 2. client_analytics — table has a direct hotel_id column
-- =============================================================
DROP POLICY IF EXISTS "Admin and concierge can read analytics" ON public.client_analytics;

CREATE POLICY "Admins can read analytics"
  ON public.client_analytics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can read analytics from their hotels"
  ON public.client_analytics FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (
      SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
    )
  );

-- =============================================================
-- 3. treatment_bundles — has direct hotel_id
-- =============================================================
DROP POLICY IF EXISTS "Concierges can view bundles" ON public.treatment_bundles;

CREATE POLICY "Concierges can view bundles from their hotels"
  ON public.treatment_bundles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (
      SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
    )
  );

-- =============================================================
-- 4. customer_treatment_bundles — has direct hotel_id
-- =============================================================
DROP POLICY IF EXISTS "Concierges can view customer bundles" ON public.customer_treatment_bundles;
DROP POLICY IF EXISTS "Concierges can insert customer bundles" ON public.customer_treatment_bundles;

CREATE POLICY "Concierges can view customer bundles from their hotels"
  ON public.customer_treatment_bundles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (
      SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
    )
  );

CREATE POLICY "Concierges can insert customer bundles for their hotels"
  ON public.customer_treatment_bundles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (
      SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
    )
  );

-- =============================================================
-- 5. bundle_session_usages — scope via parent customer_treatment_bundles.hotel_id
-- =============================================================
DROP POLICY IF EXISTS "Concierges can view bundle usages" ON public.bundle_session_usages;

CREATE POLICY "Concierges can view bundle usages from their hotels"
  ON public.bundle_session_usages FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.customer_treatment_bundles ctb
      WHERE ctb.id = bundle_session_usages.customer_bundle_id
        AND ctb.hotel_id IN (
          SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
        )
    )
  );

-- =============================================================
-- 6. bundle_amount_usages — scope via parent customer_treatment_bundles.hotel_id
-- =============================================================
DROP POLICY IF EXISTS "Concierges can view amount usages" ON public.bundle_amount_usages;

CREATE POLICY "Concierges can view amount usages from their hotels"
  ON public.bundle_amount_usages FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.customer_treatment_bundles ctb
      WHERE ctb.id = bundle_amount_usages.customer_bundle_id
        AND ctb.hotel_id IN (
          SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
        )
    )
  );
