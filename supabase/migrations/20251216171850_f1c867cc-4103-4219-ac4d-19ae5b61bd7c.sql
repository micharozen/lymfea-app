-- 1. Create a function to get public hotel data (without commission rates)
CREATE OR REPLACE FUNCTION public.get_public_hotels()
RETURNS TABLE (
  id text,
  name text,
  image text,
  cover_image text,
  city text,
  country text,
  currency text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status
  FROM public.hotels h
  WHERE h.status IN ('Active', 'Actif');
$$;

-- 2. Create a function to get public hotel by ID (without commission rates)
CREATE OR REPLACE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE (
  id text,
  name text,
  image text,
  cover_image text,
  city text,
  country text,
  currency text,
  status text,
  vat numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    h.id,
    h.name,
    h.image,
    h.cover_image,
    h.city,
    h.country,
    h.currency,
    h.status,
    h.vat
  FROM public.hotels h
  WHERE h.id = _hotel_id
    AND h.status IN ('Active', 'Actif');
$$;

-- 3. Create a function to get public treatment menus (for a specific hotel)
CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  category text,
  service_for text,
  duration integer,
  price numeric,
  price_on_request boolean,
  lead_time integer,
  image text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.id,
    t.name,
    t.description,
    t.category,
    t.service_for,
    t.duration,
    t.price,
    t.price_on_request,
    t.lead_time,
    t.image,
    t.sort_order
  FROM public.treatment_menus t
  WHERE t.status IN ('Active', 'Actif')
    AND (t.hotel_id = _hotel_id OR t.hotel_id IS NULL)
  ORDER BY t.sort_order, t.name;
$$;

-- 4. Drop the overly permissive public policies on hotels
DROP POLICY IF EXISTS "Public can view active hotels" ON public.hotels;

-- 5. Drop the overly permissive public policies on treatment_menus
DROP POLICY IF EXISTS "Public can view active treatment menus" ON public.treatment_menus;

-- 6. Create a view for concierges to see hairdresser data without stripe_account_id
CREATE OR REPLACE VIEW public.hairdresser_public_info AS
SELECT 
  id,
  first_name,
  last_name,
  email,
  phone,
  country_code,
  profile_image,
  status,
  skills,
  user_id
FROM public.hairdressers;

-- 7. Add input validation function for treatment requests
CREATE OR REPLACE FUNCTION public.validate_treatment_request(
  _client_first_name text,
  _client_phone text,
  _hotel_id text,
  _client_email text DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate required fields
  IF _client_first_name IS NULL OR length(trim(_client_first_name)) < 2 THEN
    RAISE EXCEPTION 'Invalid first name: must be at least 2 characters';
  END IF;
  
  IF length(_client_first_name) > 100 THEN
    RAISE EXCEPTION 'Invalid first name: must be less than 100 characters';
  END IF;
  
  IF _client_phone IS NULL OR length(trim(_client_phone)) < 8 THEN
    RAISE EXCEPTION 'Invalid phone number: must be at least 8 characters';
  END IF;
  
  IF length(_client_phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone number: must be less than 20 characters';
  END IF;
  
  -- Validate hotel exists
  IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND status IN ('Active', 'Actif')) THEN
    RAISE EXCEPTION 'Invalid hotel ID';
  END IF;
  
  -- Validate email format if provided
  IF _client_email IS NOT NULL AND _client_email != '' THEN
    IF _client_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Validate description length if provided
  IF _description IS NOT NULL AND length(_description) > 1000 THEN
    RAISE EXCEPTION 'Description must be less than 1000 characters';
  END IF;
  
  RETURN true;
END;
$$;

-- 8. Create a secure function to insert treatment requests with validation
CREATE OR REPLACE FUNCTION public.create_treatment_request(
  _client_first_name text,
  _client_phone text,
  _hotel_id text,
  _client_last_name text DEFAULT NULL,
  _client_email text DEFAULT NULL,
  _room_number text DEFAULT NULL,
  _description text DEFAULT NULL,
  _treatment_id uuid DEFAULT NULL,
  _preferred_date date DEFAULT NULL,
  _preferred_time time DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
BEGIN
  -- Validate inputs
  PERFORM public.validate_treatment_request(
    _client_first_name,
    _client_phone,
    _hotel_id,
    _client_email,
    _description
  );
  
  -- Insert the request
  INSERT INTO public.treatment_requests (
    client_first_name,
    client_last_name,
    client_phone,
    client_email,
    hotel_id,
    room_number,
    description,
    treatment_id,
    preferred_date,
    preferred_time
  ) VALUES (
    trim(_client_first_name),
    trim(_client_last_name),
    trim(_client_phone),
    trim(_client_email),
    _hotel_id,
    trim(_room_number),
    trim(_description),
    _treatment_id,
    _preferred_date,
    _preferred_time
  )
  RETURNING id INTO _new_id;
  
  RETURN _new_id;
END;
$$;

-- 9. Remove the public INSERT policy on treatment_requests (will use function instead)
DROP POLICY IF EXISTS "Public can insert treatment requests" ON public.treatment_requests;