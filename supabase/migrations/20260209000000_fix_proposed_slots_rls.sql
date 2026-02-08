-- Fix: Add missing INSERT and SELECT policies for authenticated users on booking_proposed_slots
-- The table only had SELECT for hairdressers and ALL for service_role,
-- so client-side inserts from concierges/admins were silently blocked by RLS.

-- Allow authenticated users (admins, concierges) to insert proposed slots
CREATE POLICY "Authenticated users can insert proposed slots"
  ON booking_proposed_slots FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users (admins, concierges) to view proposed slots
CREATE POLICY "Authenticated users can view proposed slots"
  ON booking_proposed_slots FOR SELECT
  USING (auth.role() = 'authenticated');
