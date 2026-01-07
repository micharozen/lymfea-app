-- Fix otp_rate_limits: Add RLS policy (internal table, service role only)
CREATE POLICY "Block all user access to otp_rate_limits"
ON public.otp_rate_limits
FOR ALL
USING (false);

-- Fix notifications: Replace overly permissive INSERT policy
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Notifications are created by triggers and service role, not regular users
CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  -- Only admins and hairdressers can receive notifications
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = notifications.user_id
    AND user_roles.role IN ('admin', 'hairdresser')
  )
);