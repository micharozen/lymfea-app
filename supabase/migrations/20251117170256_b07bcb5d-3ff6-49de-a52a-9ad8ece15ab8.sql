-- Create a security definer function to get hotels for a concierge
CREATE OR REPLACE FUNCTION public.get_concierge_hotels(_user_id uuid)
RETURNS TABLE(hotel_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ch.hotel_id
  FROM public.concierge_hotels ch
  JOIN public.concierges c ON c.id = ch.concierge_id
  WHERE c.user_id = _user_id;
$$;

-- Update bookings RLS policies to allow concierges to view bookings from their hotels
CREATE POLICY "Concierges can view bookings from their hotels"
ON public.bookings
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

CREATE POLICY "Concierges can create bookings for their hotels"
ON public.bookings
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

CREATE POLICY "Concierges can update bookings from their hotels"
ON public.bookings
FOR UPDATE
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

-- Update hotels RLS policies to allow concierges to view only their hotels
CREATE POLICY "Concierges can view their hotels"
ON public.hotels
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

-- Update treatment_menus RLS policies to allow concierges to view menus from their hotels
CREATE POLICY "Concierges can view treatment menus from their hotels"
ON public.treatment_menus
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  (hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())) OR hotel_id IS NULL)
);

-- Update boxes RLS policies to allow concierges to view boxes from their hotels
CREATE POLICY "Concierges can view boxes from their hotels"
ON public.boxes
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

-- Update hairdressers RLS policies to allow concierges to view hairdressers working in their hotels
CREATE POLICY "Concierges can view hairdressers from their hotels"
ON public.hairdressers
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  id IN (
    SELECT hh.hairdresser_id
    FROM public.hairdresser_hotels hh
    WHERE hh.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
);

-- Update concierges RLS to allow concierges to view other concierges from their hotels
CREATE POLICY "Concierges can view concierges from their hotels"
ON public.concierges
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  id IN (
    SELECT ch.concierge_id
    FROM public.concierge_hotels ch
    WHERE ch.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
);

-- Update concierge_hotels RLS to allow concierges to view their hotel associations
CREATE POLICY "Concierges can view their hotel associations"
ON public.concierge_hotels
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
);

-- Update booking_treatments RLS to allow concierges to view treatments for bookings from their hotels
CREATE POLICY "Concierges can view booking treatments from their hotels"
ON public.booking_treatments
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
);

CREATE POLICY "Concierges can create booking treatments for their hotels"
ON public.booking_treatments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'concierge'::app_role) AND
  booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
);

CREATE POLICY "Concierges can delete booking treatments from their hotels"
ON public.booking_treatments
FOR DELETE
USING (
  has_role(auth.uid(), 'concierge'::app_role) AND
  booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
);

-- Update handle_new_user trigger to assign concierge role when a concierge signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Find matching admin by email and update their user_id
  UPDATE public.admins
  SET 
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If an admin record was found and updated, assign admin role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;
  
  -- Find matching concierge by email and update their user_id
  UPDATE public.concierges
  SET 
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If a concierge record was found and updated, assign concierge role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'concierge')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;