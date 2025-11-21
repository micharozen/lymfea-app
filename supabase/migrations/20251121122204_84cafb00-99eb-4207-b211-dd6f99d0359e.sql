-- Allow hairdressers to view hotels where they have bookings
CREATE POLICY "Hairdressers can view hotels from their bookings"
ON public.hotels
FOR SELECT
USING (
  has_role(auth.uid(), 'hairdresser'::app_role) 
  AND id IN (
    SELECT DISTINCT hotel_id 
    FROM bookings 
    WHERE hairdresser_id = get_hairdresser_id(auth.uid())
  )
);