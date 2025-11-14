-- Create hotels table
CREATE TABLE public.hotels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all hotels"
  ON public.hotels
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create hotels"
  ON public.hotels
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update hotels"
  ON public.hotels
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete hotels"
  ON public.hotels
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_hotels_updated_at
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert existing hotels data
INSERT INTO public.hotels (id, name, image, address, city, country) VALUES
  ('sofitel-paris', 'Hôtel Sofitel Paris le Faubourg', 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400&h=300&fit=crop', '15 Rue Boissy d''Anglas', 'Paris', 'France'),
  ('mandarin-london', 'Mandarin Oriental Hyde Park, London', 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400&h=300&fit=crop', '66 Knightsbridge', 'London', 'United Kingdom'),
  ('test', 'TEST', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop', 'Test Address', 'Test City', 'Test Country');