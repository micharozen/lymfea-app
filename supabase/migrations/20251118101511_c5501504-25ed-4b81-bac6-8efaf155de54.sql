-- Allow concierges to view their own profile
CREATE POLICY "Concierges can view their own profile"
ON public.concierges
FOR SELECT
USING (auth.uid() = user_id);