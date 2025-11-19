
-- Allow hairdressers to view their own hotel associations
CREATE POLICY "Hairdressers can view their own hotel associations"
ON public.hairdresser_hotels
FOR SELECT
TO authenticated
USING (
  hairdresser_id IN (
    SELECT id FROM public.hairdressers WHERE user_id = auth.uid()
  )
);
