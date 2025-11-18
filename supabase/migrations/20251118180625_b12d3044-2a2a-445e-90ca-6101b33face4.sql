-- Allow hairdressers to create their own profile during onboarding
CREATE POLICY "Hairdressers can create their own profile"
ON public.hairdressers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow hairdressers to view their own profile
CREATE POLICY "Hairdressers can view their own profile"
ON public.hairdressers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow hairdressers to update their own profile
CREATE POLICY "Hairdressers can update their own profile"
ON public.hairdressers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);