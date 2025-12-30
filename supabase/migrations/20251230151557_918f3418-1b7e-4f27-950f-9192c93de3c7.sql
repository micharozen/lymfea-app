-- Add quote_token column for secure email link validation
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS quote_token text;

-- Add index for quick token lookups
CREATE INDEX IF NOT EXISTS idx_bookings_quote_token ON public.bookings(quote_token) WHERE quote_token IS NOT NULL;