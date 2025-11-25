-- Add Stripe Connect account ID to hairdressers table
ALTER TABLE public.hairdressers 
ADD COLUMN IF NOT EXISTS stripe_account_id text;