-- Allow concierges to update their own profile
CREATE POLICY "Concierges can update their own profile"
ON public.concierges
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);