-- Drop the restrictive update policy for concierges that prevents status updates
DROP POLICY IF EXISTS "Concierges can update their own profile" ON public.concierges;

-- Create a more permissive policy that allows concierges to update their full profile including status
CREATE POLICY "Concierges can update their own profile"
ON public.concierges
FOR UPDATE
USING (auth.uid() = user_id);
