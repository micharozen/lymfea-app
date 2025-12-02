-- Create a table to track sent push notifications for deduplication
CREATE TABLE IF NOT EXISTS push_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  user_id UUID NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(booking_id, user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_booking_user ON push_notification_logs(booking_id, user_id);

-- Allow edge functions to insert (using service role)
ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy for service role access
CREATE POLICY "Service role can manage push logs"
ON push_notification_logs
FOR ALL
USING (true)
WITH CHECK (true);