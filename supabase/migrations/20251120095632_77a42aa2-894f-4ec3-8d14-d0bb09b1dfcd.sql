-- Add RLS policy for hairdressers to view treatment menus from their affiliated hotels
CREATE POLICY "Hairdressers can view treatment menus from their hotels"
ON public.treatment_menus
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hairdresser'::app_role) AND (
    hotel_id IN (
      SELECT hh.hotel_id 
      FROM hairdresser_hotels hh
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    ) 
    OR hotel_id IS NULL  -- Allow viewing global treatments
  )
);