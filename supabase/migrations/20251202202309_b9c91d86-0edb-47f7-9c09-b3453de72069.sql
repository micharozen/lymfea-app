-- Drop both existing hairdresser update policies
DROP POLICY IF EXISTS "Hairdressers can unassign their own bookings" ON bookings;
DROP POLICY IF EXISTS "Hairdressers can update their own bookings" ON bookings;

-- Create a single permissive policy for hairdressers to update bookings
CREATE POLICY "Hairdressers can update their own bookings" 
ON bookings 
FOR UPDATE 
USING (
  hairdresser_id IN (
    SELECT hairdressers.id
    FROM hairdressers
    WHERE hairdressers.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Allow setting hairdresser_id to NULL (unassign) OR keeping it as current user's id
  (hairdresser_id IS NULL) OR (hairdresser_id IN (
    SELECT hairdressers.id
    FROM hairdressers
    WHERE hairdressers.user_id = auth.uid()
  ))
);