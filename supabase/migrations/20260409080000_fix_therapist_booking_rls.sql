-- Migration: Replace 3 remaining "Hairdressers can..." RLS policies
-- missed in 20260222000008_drop_hairdresser_compat.sql.
--
-- These policies still reference old names (hairdressers table, hairdresser_id column)
-- in their decompiled text. Replace with canonical versions using get_therapist_id()
-- for consistency with all other therapist policies.

-- ============================================
-- 1. Drop old policies
-- ============================================

DROP POLICY IF EXISTS "Hairdressers can view their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Hairdressers can update their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Hairdressers can view treatments for their bookings" ON public.booking_treatments;

-- ============================================
-- 2. Recreate with canonical names and get_therapist_id()
-- ============================================

-- Therapist can SELECT bookings assigned to them (any status).
-- Required for PWA /pwa/bookings page.
CREATE POLICY "Therapists can view their own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (therapist_id = public.get_therapist_id(auth.uid()));

-- Therapist can UPDATE bookings assigned to them.
-- WITH CHECK allows setting therapist_id to NULL (unassign) or to their own ID (accept).
CREATE POLICY "Therapists can update their own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (therapist_id = public.get_therapist_id(auth.uid()))
  WITH CHECK (
    therapist_id IS NULL
    OR therapist_id = public.get_therapist_id(auth.uid())
  );

-- Therapist can SELECT treatments for bookings assigned to them.
-- Required for PWA /pwa/booking/:id detail page.
CREATE POLICY "Therapists can view treatments for their bookings"
  ON public.booking_treatments FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.therapist_id = public.get_therapist_id(auth.uid())
    )
  );
