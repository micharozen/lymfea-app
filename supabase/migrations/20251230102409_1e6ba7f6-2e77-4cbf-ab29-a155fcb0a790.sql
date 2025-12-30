-- Allow concierges to view hairdresser_hotels for their assigned hotels
CREATE POLICY "Concierges can view hairdresser hotels from their hotels"
ON public.hairdresser_hotels
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) 
  AND hotel_id IN (
    SELECT get_concierge_hotels.hotel_id
    FROM get_concierge_hotels(auth.uid()) get_concierge_hotels(hotel_id)
  )
);