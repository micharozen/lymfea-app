-- Add venue_type column to hotels table
-- Allows differentiating between hotel and coworking spaces

ALTER TABLE public.hotels
ADD COLUMN IF NOT EXISTS venue_type TEXT DEFAULT 'hotel' CHECK (venue_type IN ('hotel', 'coworking'));

-- Update existing hotels to have 'hotel' type (already default, but explicit)
UPDATE public.hotels SET venue_type = 'hotel' WHERE venue_type IS NULL;

-- Add index for filtering by venue type
CREATE INDEX IF NOT EXISTS idx_hotels_venue_type ON public.hotels(venue_type);
