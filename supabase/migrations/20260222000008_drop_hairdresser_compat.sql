-- Migration: Drop backward-compatible hairdresser_* views and wrapper functions
-- All frontend code and edge functions now use the canonical therapist* names.
-- Before dropping, recreate all RLS policies that depended on get_hairdresser_id
-- and hairdresser_hotels view, replacing them with get_therapist_id + therapist_venues.

-- ============================================
-- 1. Drop RLS policies that depend on get_hairdresser_id or hairdresser_hotels view
-- ============================================

DROP POLICY IF EXISTS "Hairdressers can view concierge hotels from their hotels" ON public.concierge_hotels;
DROP POLICY IF EXISTS "Hairdressers can view concierges from their hotels" ON public.concierges;
DROP POLICY IF EXISTS "Hairdressers can view hotels from their bookings" ON public.hotels;
DROP POLICY IF EXISTS "Hairdressers can view their own hotel associations" ON public.therapist_venues;
DROP POLICY IF EXISTS "Hairdressers can view their own ratings" ON public.therapist_ratings;
DROP POLICY IF EXISTS "Hairdressers can view their payouts" ON public.therapist_payouts;
DROP POLICY IF EXISTS "Hairdressers can view treatment menus from their hotels" ON public.treatment_menus;
DROP POLICY IF EXISTS "Hairdressers can view pending bookings from their hotels" ON public.bookings;
DROP POLICY IF EXISTS "Hairdressers can create bookings for their hotels" ON public.bookings;
DROP POLICY IF EXISTS "Hairdressers can view treatments for pending bookings" ON public.booking_treatments;
DROP POLICY IF EXISTS "Hairdressers can create treatments for pending bookings in thei" ON public.booking_treatments;
DROP POLICY IF EXISTS "Hairdressers can delete treatments for pending bookings in thei" ON public.booking_treatments;
DROP POLICY IF EXISTS "Hairdressers can create treatments for their own bookings" ON public.booking_treatments;

-- ============================================
-- 2. Recreate policies using get_therapist_id and therapist_venues
-- ============================================

CREATE POLICY "Therapists can view concierge hotels from their hotels"
  ON public.concierge_hotels FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
  );

CREATE POLICY "Therapists can view concierges from their hotels"
  ON public.concierges FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND id IN (
      SELECT ch.concierge_id FROM public.concierge_hotels ch
      WHERE ch.hotel_id IN (
        SELECT tv.hotel_id FROM public.therapist_venues tv
        WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
      )
    )
  );

CREATE POLICY "Therapists can view hotels from their bookings"
  ON public.hotels FOR SELECT
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND id IN (
      SELECT DISTINCT b.hotel_id FROM public.bookings b
      WHERE b.therapist_id = public.get_therapist_id(auth.uid())
    )
  );

CREATE POLICY "Therapists can view their own hotel associations"
  ON public.therapist_venues FOR SELECT TO authenticated
  USING (therapist_id = public.get_therapist_id(auth.uid()));

CREATE POLICY "Therapists can view their own ratings"
  ON public.therapist_ratings FOR SELECT
  USING (therapist_id = public.get_therapist_id(auth.uid()));

CREATE POLICY "Therapists can view their payouts"
  ON public.therapist_payouts FOR SELECT
  USING (therapist_id = public.get_therapist_id(auth.uid()));

CREATE POLICY "Therapists can view treatment menus from their hotels"
  ON public.treatment_menus FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND (
      hotel_id IN (
        SELECT tv.hotel_id FROM public.therapist_venues tv
        WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
      )
      OR hotel_id IS NULL
    )
  );

CREATE POLICY "Therapists can view pending bookings from their hotels"
  ON public.bookings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND status IN ('pending', 'awaiting_hairdresser_selection')
    AND therapist_id IS NULL
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
    AND NOT (public.get_therapist_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
  );

CREATE POLICY "Therapists can create bookings for their hotels"
  ON public.bookings FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'therapist'::public.app_role)
    AND hotel_id IN (
      SELECT tv.hotel_id FROM public.therapist_venues tv
      WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
    )
  );

CREATE POLICY "Therapists can view treatments for pending bookings"
  ON public.booking_treatments FOR SELECT
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

CREATE POLICY "Therapists can create treatments for their own bookings"
  ON public.booking_treatments FOR INSERT
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.therapist_id = public.get_therapist_id(auth.uid())
        AND b.hotel_id IN (
          SELECT tv.hotel_id FROM public.therapist_venues tv
          WHERE tv.therapist_id = public.get_therapist_id(auth.uid())
        )
    )
  );

-- ============================================
-- 3. Drop backward-compatible views
-- ============================================

DROP VIEW IF EXISTS hairdressers;
DROP VIEW IF EXISTS hairdresser_hotels;
DROP VIEW IF EXISTS hairdresser_payouts;
DROP VIEW IF EXISTS hairdresser_ratings;

-- ============================================
-- 4. Drop backward-compatible wrapper functions
-- ============================================

DROP FUNCTION IF EXISTS get_hairdresser_id(uuid);
DROP FUNCTION IF EXISTS get_public_hairdressers(text);

-- Note: has_role(uuid, text) is intentionally kept — it is still used.
