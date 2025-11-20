-- Allow hairdressers to view admins (read-only)
CREATE POLICY "Hairdressers can view admins"
ON public.admins
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'hairdresser'));