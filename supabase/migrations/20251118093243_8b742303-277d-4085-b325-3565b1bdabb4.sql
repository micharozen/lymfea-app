-- Allow concierges to view admins (read-only access)
CREATE POLICY "Concierges can view all admins"
ON public.admins
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'concierge'::app_role));