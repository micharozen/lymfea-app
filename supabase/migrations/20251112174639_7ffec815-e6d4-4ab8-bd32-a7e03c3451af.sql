-- Create admins table
CREATE TABLE public.admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+33',
  profile_image TEXT,
  status TEXT NOT NULL DEFAULT 'Actif',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all admins"
ON public.admins
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can create admins"
ON public.admins
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can update admins"
ON public.admins
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Admins can delete admins"
ON public.admins
FOR DELETE
TO authenticated
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_admins_updated_at
BEFORE UPDATE ON public.admins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for email lookups
CREATE INDEX idx_admins_email ON public.admins(email);

-- Create index for user_id lookups
CREATE INDEX idx_admins_user_id ON public.admins(user_id);