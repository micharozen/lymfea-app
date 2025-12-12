-- Add must_change_password column to concierges table
ALTER TABLE public.concierges 
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.concierges.must_change_password IS 'Flag to force password change on first login';