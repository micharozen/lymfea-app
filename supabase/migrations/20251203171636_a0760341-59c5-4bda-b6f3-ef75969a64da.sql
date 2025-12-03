-- 1. Add client_note column to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_note TEXT;

-- 2. Create hairdresser_ratings table for rating system
CREATE TABLE IF NOT EXISTS public.hairdresser_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  hairdresser_id UUID NOT NULL REFERENCES public.hairdressers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  rating_token TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hairdresser_ratings ENABLE ROW LEVEL SECURITY;

-- RLS policies for hairdresser_ratings
CREATE POLICY "Hairdressers can view their own ratings"
ON public.hairdresser_ratings FOR SELECT
USING (hairdresser_id = get_hairdresser_id(auth.uid()));

CREATE POLICY "Admins can view all ratings"
ON public.hairdresser_ratings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert ratings with valid token"
ON public.hairdresser_ratings FOR INSERT
WITH CHECK (rating_token IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_hairdresser_ratings_hairdresser_id ON public.hairdresser_ratings(hairdresser_id);
CREATE INDEX IF NOT EXISTS idx_hairdresser_ratings_token ON public.hairdresser_ratings(rating_token);