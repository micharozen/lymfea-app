-- Add 'enterprise' venue_type and description column to hotels table

-- Update the venue_type constraint to include 'enterprise'
ALTER TABLE public.hotels DROP CONSTRAINT IF EXISTS hotels_venue_type_check;
ALTER TABLE public.hotels ADD CONSTRAINT hotels_venue_type_check
  CHECK (venue_type IN ('hotel', 'coworking', 'enterprise'));

-- Add description column for enterprise/venue branding
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS description TEXT;
