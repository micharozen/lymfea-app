-- Add stripe_onboarding_completed to hairdressers table
ALTER TABLE public.hairdressers 
ADD COLUMN IF NOT EXISTS stripe_onboarding_completed boolean DEFAULT false;