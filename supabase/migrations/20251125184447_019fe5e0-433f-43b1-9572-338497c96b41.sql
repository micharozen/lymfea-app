-- Add public read access for hotels table
-- This allows unauthenticated clients to view hotel information
CREATE POLICY "Public can view active hotels" 
ON public.hotels 
FOR SELECT 
TO public 
USING (status = 'Active');

-- Add public read access for treatment menus
-- This allows clients to browse available treatments
CREATE POLICY "Public can view active treatment menus" 
ON public.treatment_menus 
FOR SELECT 
TO public 
USING (status = 'Actif');