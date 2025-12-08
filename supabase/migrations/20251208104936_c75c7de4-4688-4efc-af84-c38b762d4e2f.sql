-- Fix RLS policy for hotels to accept both 'Active' and 'Actif'
DROP POLICY IF EXISTS "Public can view active hotels" ON public.hotels;
CREATE POLICY "Public can view active hotels"
ON public.hotels
FOR SELECT
USING (status IN ('Active', 'Actif'));

-- Fix RLS policy for treatment_menus
DROP POLICY IF EXISTS "Public can view active treatment menus" ON public.treatment_menus;
CREATE POLICY "Public can view active treatment menus"
ON public.treatment_menus
FOR SELECT
USING (status IN ('Active', 'Actif'));