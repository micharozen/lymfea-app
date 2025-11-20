-- Step 1: Create a SECURITY DEFINER function to get hairdresser ID
CREATE OR REPLACE FUNCTION public.get_hairdresser_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.hairdressers WHERE user_id = _user_id LIMIT 1;
$$;

-- Step 2: Drop the recursive policy
DROP POLICY IF EXISTS "Hairdressers can view their own hotel associations" ON public.hairdresser_hotels;

-- Step 3: Create a new non-recursive policy using the SECURITY DEFINER function
CREATE POLICY "Hairdressers can view their own hotel associations"
ON public.hairdresser_hotels
FOR SELECT
TO authenticated
USING (hairdresser_id = public.get_hairdresser_id(auth.uid()));