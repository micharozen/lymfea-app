-- Migration: Allow hairdressers to create bookings from the PWA
-- Previously only admins and concierges had INSERT policies on bookings.
-- Hairdressers need to create bookings directly from /pwa/new-booking.

-- 1. Allow hairdressers to INSERT bookings (scoped to their affiliated hotels)
CREATE POLICY "Hairdressers can create bookings for their hotels"
  ON bookings FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'hairdresser'::app_role)
    AND hotel_id IN (
      SELECT hh.hotel_id FROM hairdresser_hotels hh
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
  );

-- 2. Allow hairdressers to INSERT booking_treatments for bookings assigned to them.
-- The existing policy only covers pending/unassigned bookings.
-- Hairdresser-created bookings have status='confirmed' and hairdresser_id set,
-- so they need a separate policy.
CREATE POLICY "Hairdressers can create treatments for their own bookings"
  ON booking_treatments FOR INSERT
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.hairdresser_id = get_hairdresser_id(auth.uid())
        AND b.hotel_id IN (
          SELECT hh.hotel_id FROM hairdresser_hotels hh
          WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
        )
    )
  );
