-- Log schedule reminder pushes to therapists (dedup per period)

CREATE TABLE IF NOT EXISTS public.schedule_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('weekly', 'monthly')),
  target_month text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (therapist_id, reminder_type, target_month)
);

CREATE INDEX IF NOT EXISTS idx_schedule_reminder_logs_therapist
  ON public.schedule_reminder_logs (therapist_id, sent_at DESC);

ALTER TABLE public.schedule_reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_schedule_reminder_logs"
  ON public.schedule_reminder_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
