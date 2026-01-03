-- Create rate limiting table for OTP requests
CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  request_type text NOT NULL, -- 'send' or 'verify'
  attempt_count integer NOT NULL DEFAULT 1,
  first_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  last_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked_until timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create unique index for phone + type combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_rate_limits_phone_type 
  ON public.otp_rate_limits (phone_number, request_type);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_first_attempt 
  ON public.otp_rate_limits (first_attempt_at);

-- Enable RLS (no policies needed as this is only accessed by edge functions with service role)
ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Create cleanup function to remove old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.otp_rate_limits 
  WHERE first_attempt_at < now() - interval '1 hour';
END;
$$;