-- Create boxes table
CREATE TABLE IF NOT EXISTS public.boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  box_model text NOT NULL,
  box_id text NOT NULL,
  image text,
  hotel_id text,
  hotel_name text,
  hairdresser_name text,
  next_booking timestamp with time zone,
  status text NOT NULL DEFAULT 'Available',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;

-- Create policies for boxes
CREATE POLICY "Admins can view all boxes"
  ON public.boxes
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create boxes"
  ON public.boxes
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update boxes"
  ON public.boxes
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete boxes"
  ON public.boxes
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));