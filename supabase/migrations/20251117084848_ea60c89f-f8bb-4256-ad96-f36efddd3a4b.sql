-- Create treatment_menus table
CREATE TABLE public.treatment_menus (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  duration integer, -- duration in minutes
  price numeric(10,2) DEFAULT 0.00,
  buffer_time integer, -- buffer time in minutes
  service_for text NOT NULL, -- 'Male', 'Female', or 'All'
  category text NOT NULL,
  hotel_id text,
  image text,
  status text NOT NULL DEFAULT 'Actif',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.treatment_menus ENABLE ROW LEVEL SECURITY;

-- Create policies for treatment_menus
CREATE POLICY "Admins can view all treatment menus"
ON public.treatment_menus
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create treatment menus"
ON public.treatment_menus
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update treatment menus"
ON public.treatment_menus
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete treatment menus"
ON public.treatment_menus
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_treatment_menus_updated_at
BEFORE UPDATE ON public.treatment_menus
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();