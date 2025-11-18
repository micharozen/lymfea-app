-- Hotels: Concierges can already view their hotels (policy exists)
-- No change needed for hotels

-- Boxes: Allow concierges to view boxes from their hotels
CREATE POLICY "Concierges can view boxes from their hotels (read-only)"
ON public.boxes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role) 
  AND hotel_id IN (
    SELECT hotel_id 
    FROM get_concierge_hotels(auth.uid())
  )
);

-- Treatment Menus: Allow concierges to view treatment menus from their hotels
CREATE POLICY "Concierges can view treatment menus from their hotels (read-only)"
ON public.treatment_menus
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role) 
  AND (
    hotel_id IN (
      SELECT hotel_id 
      FROM get_concierge_hotels(auth.uid())
    )
    OR hotel_id IS NULL
  )
);

-- Hairdressers: Allow concierges to view hairdressers from their hotels
CREATE POLICY "Concierges can view hairdressers from their hotels (read-only)"
ON public.hairdressers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role) 
  AND id IN (
    SELECT hh.hairdresser_id
    FROM hairdresser_hotels hh
    WHERE hh.hotel_id IN (
      SELECT hotel_id 
      FROM get_concierge_hotels(auth.uid())
    )
  )
);