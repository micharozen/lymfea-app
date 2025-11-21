-- Allow hairdressers to unassign themselves from their own bookings
CREATE POLICY "Hairdressers can unassign their own bookings"
ON public.bookings
FOR UPDATE
USING (
  hairdresser_id IN (
    SELECT hairdressers.id
    FROM hairdressers
    WHERE hairdressers.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Allow setting to null (unassigning) OR keeping their own ID
  hairdresser_id IS NULL 
  OR hairdresser_id IN (
    SELECT hairdressers.id
    FROM hairdressers
    WHERE hairdressers.user_id = auth.uid()
  )
);