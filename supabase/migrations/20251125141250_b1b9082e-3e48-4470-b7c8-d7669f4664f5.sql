-- Allow hairdressers to delete their own notifications
CREATE POLICY "Hairdressers can delete their own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (
  user_id IN (
    SELECT user_id 
    FROM public.hairdressers 
    WHERE user_id = auth.uid()
  )
);