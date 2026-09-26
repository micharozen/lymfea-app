-- Planned launch date of the venue, set by the super-admin when creating the
-- onboarding link and shown to the venue on the public wizard (/setup/:token).
ALTER TABLE public.venue_setup_submissions
  ADD COLUMN IF NOT EXISTS launch_date date;

COMMENT ON COLUMN public.venue_setup_submissions.launch_date IS
  'Date de lancement prévue du lieu, affichée sur le wizard public d''onboarding.';
