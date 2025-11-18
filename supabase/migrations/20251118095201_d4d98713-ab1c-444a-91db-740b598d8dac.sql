-- Allow concierges to delete bookings from their hotels
CREATE POLICY "Concierges can delete bookings from their hotels"
ON public.bookings
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role) 
  AND hotel_id IN (
    SELECT hotel_id 
    FROM get_concierge_hotels(auth.uid())
  )
);