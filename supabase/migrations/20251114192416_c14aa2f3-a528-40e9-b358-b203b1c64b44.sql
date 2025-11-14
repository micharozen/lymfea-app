-- Create concierges table
CREATE TABLE public.concierges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+33',
  hotel_id TEXT,
  profile_image TEXT,
  status TEXT NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.concierges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for concierges
CREATE POLICY "Admins can view all concierges"
  ON public.concierges
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create concierges"
  ON public.concierges
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update concierges"
  ON public.concierges
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete concierges"
  ON public.concierges
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_concierges_updated_at
  BEFORE UPDATE ON public.concierges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();