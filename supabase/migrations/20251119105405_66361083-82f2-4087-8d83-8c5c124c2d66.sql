-- Add 'hairdresser' role to app_role enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'hairdresser' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'hairdresser';
  END IF;
END $$;

-- Create RLS policies for hairdressers to view their bookings
CREATE POLICY "Hairdressers can view their own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  hairdresser_id IN (
    SELECT id FROM public.hairdressers WHERE user_id = auth.uid()
  )
);

-- Create RLS policies for hairdressers to update their bookings
CREATE POLICY "Hairdressers can update their own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  hairdresser_id IN (
    SELECT id FROM public.hairdressers WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  hairdresser_id IN (
    SELECT id FROM public.hairdressers WHERE user_id = auth.uid()
  )
);

-- Create RLS policy for hairdressers to view booking treatments
CREATE POLICY "Hairdressers can view treatments for their bookings"
ON public.booking_treatments
FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT id FROM public.bookings 
    WHERE hairdresser_id IN (
      SELECT id FROM public.hairdressers WHERE user_id = auth.uid()
    )
  )
);