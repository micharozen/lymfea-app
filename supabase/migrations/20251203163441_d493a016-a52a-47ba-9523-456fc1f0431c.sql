-- Add password_set flag to hairdressers table
ALTER TABLE public.hairdressers ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT false;