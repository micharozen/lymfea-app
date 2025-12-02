-- Drop the existing policy
DROP POLICY IF EXISTS "Hairdressers can view pending bookings from their hotels" ON bookings;

-- Create updated policy that excludes declined bookings
CREATE POLICY "Hairdressers can view pending bookings from their hotels" 
ON bookings 
FOR SELECT 
USING (
  has_role(auth.uid(), 'hairdresser'::app_role) 
  AND status = 'En attente'::text 
  AND hairdresser_id IS NULL 
  AND hotel_id IN (
    SELECT hh.hotel_id
    FROM hairdresser_hotels hh
    WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
  )
  AND NOT (get_hairdresser_id(auth.uid()) = ANY(COALESCE(declined_by, ARRAY[]::uuid[])))
);