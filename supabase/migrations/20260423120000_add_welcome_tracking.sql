-- Track when admins/concierges have seen the in-app welcome guide.
-- A NULL value means the guide is still pending and should auto-open.

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz;

ALTER TABLE public.concierges
  ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz;
