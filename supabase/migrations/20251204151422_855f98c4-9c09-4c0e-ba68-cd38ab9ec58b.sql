-- Step 1: Add stripe_invoice_url column to bookings
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS stripe_invoice_url text;

-- Step 2: Create signatures bucket for public access
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 3: Create RLS policies for signatures bucket
CREATE POLICY "Public can view signatures"
ON storage.objects FOR SELECT
USING (bucket_id = 'signatures');

CREATE POLICY "Service role can upload signatures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'signatures');