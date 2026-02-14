-- Migration: Fix RLS policies to include 'awaiting_hairdresser_selection' status
-- The concierge booking flow creates bookings with status 'awaiting_hairdresser_selection',
-- but RLS policies only allowed hairdressers to see bookings with status 'pending'.
-- This caused bookings to be invisible and notification clicks to error.

-- 1. Fix bookings SELECT policy for hairdressers
DROP POLICY "Hairdressers can view pending bookings from their hotels" ON bookings;

CREATE POLICY "Hairdressers can view pending bookings from their hotels" ON bookings
  FOR SELECT USING (
    has_role(auth.uid(), 'hairdresser'::app_role)
    AND status IN ('pending', 'awaiting_hairdresser_selection')
    AND hairdresser_id IS NULL
    AND hotel_id IN (
      SELECT hh.hotel_id FROM hairdresser_hotels hh
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
    AND NOT (get_hairdresser_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
  );

-- 2. Fix booking_treatments SELECT policy
DROP POLICY "Hairdressers can view treatments for pending bookings" ON booking_treatments;

CREATE POLICY "Hairdressers can view treatments for pending bookings" ON booking_treatments
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND b.hairdresser_id IS NULL
        AND b.hotel_id IN (
          SELECT hh.hotel_id FROM hairdresser_hotels hh
          WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
        )
    )
  );

-- 3. Fix booking_treatments INSERT policy
DROP POLICY "Hairdressers can create treatments for pending bookings in thei" ON booking_treatments;

CREATE POLICY "Hairdressers can create treatments for pending bookings in thei" ON booking_treatments
  FOR INSERT WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND b.hairdresser_id IS NULL
        AND b.hotel_id IN (
          SELECT hh.hotel_id FROM hairdresser_hotels hh
          WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
        )
    )
  );

-- 4. Fix booking_treatments DELETE policy
DROP POLICY "Hairdressers can delete treatments for pending bookings in thei" ON booking_treatments;

CREATE POLICY "Hairdressers can delete treatments for pending bookings in thei" ON booking_treatments
  FOR DELETE USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.status IN ('pending', 'awaiting_hairdresser_selection')
        AND b.hairdresser_id IS NULL
        AND b.hotel_id IN (
          SELECT hh.hotel_id FROM hairdresser_hotels hh
          WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
        )
    )
  );
