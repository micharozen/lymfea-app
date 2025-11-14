-- Create hairdresser_hotels junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.hairdresser_hotels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hairdresser_id uuid NOT NULL REFERENCES public.hairdressers(id) ON DELETE CASCADE,
  hotel_id text NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(hairdresser_id, hotel_id)
);

-- Enable RLS on hairdresser_hotels
ALTER TABLE public.hairdresser_hotels ENABLE ROW LEVEL SECURITY;

-- Create policies for hairdresser_hotels
CREATE POLICY "Anyone can view hairdresser hotels"
  ON public.hairdresser_hotels
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert hairdresser hotels"
  ON public.hairdresser_hotels
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update hairdresser hotels"
  ON public.hairdresser_hotels
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete hairdresser hotels"
  ON public.hairdresser_hotels
  FOR DELETE
  USING (true);

-- Rename boxes_list to boxes
ALTER TABLE public.hairdressers RENAME COLUMN boxes_list TO boxes;

-- Remove rating column from hairdressers
ALTER TABLE public.hairdressers DROP COLUMN IF EXISTS rating;

-- Remove hotel_id column from hairdressers (now using junction table)
ALTER TABLE public.hairdressers DROP COLUMN IF EXISTS hotel_id;