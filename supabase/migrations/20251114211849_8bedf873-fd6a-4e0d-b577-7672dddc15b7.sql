-- Create hairdressers table
CREATE TABLE public.hairdressers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+33',
  phone TEXT NOT NULL,
  profile_image TEXT,
  status TEXT NOT NULL DEFAULT 'En attente',
  hotel_id UUID,
  boxes_list TEXT,
  skills TEXT[] DEFAULT '{}',
  rating INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID
);

-- Enable Row Level Security
ALTER TABLE public.hairdressers ENABLE ROW LEVEL SECURITY;

-- Create policies for hairdressers
CREATE POLICY "Anyone can view hairdressers"
ON public.hairdressers
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert hairdressers"
ON public.hairdressers
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update hairdressers"
ON public.hairdressers
FOR UPDATE
USING (true);

CREATE POLICY "Admins can delete hairdressers"
ON public.hairdressers
FOR DELETE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_hairdressers_updated_at
BEFORE UPDATE ON public.hairdressers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();