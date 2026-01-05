-- Add submitted_at column to track when rating was finalized (prevents multiple updates)
ALTER TABLE public.hairdresser_ratings 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE NULL;

-- Create UPDATE policy that only allows updating if not yet submitted
-- This prevents rating manipulation after initial submission
CREATE POLICY "Public can update ratings once with valid token"
ON public.hairdresser_ratings
FOR UPDATE
USING (rating_token IS NOT NULL AND submitted_at IS NULL)
WITH CHECK (rating_token IS NOT NULL);

-- Add comment for documentation
COMMENT ON COLUMN public.hairdresser_ratings.submitted_at IS 'Timestamp when client finalized their rating - prevents subsequent updates';