-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Service role can manage push logs" ON public.push_notification_logs;

-- Create proper RLS policies for admin-only access
CREATE POLICY "Admins can view push notification logs"
ON public.push_notification_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert push notification logs"
ON public.push_notification_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete push notification logs"
ON public.push_notification_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'));