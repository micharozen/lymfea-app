-- Fix validate_treatment_request to handle lowercase status
CREATE OR REPLACE FUNCTION public.validate_treatment_request(
  _client_first_name text, 
  _client_phone text, 
  _hotel_id text, 
  _client_email text DEFAULT NULL::text, 
  _description text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  -- Validate hotel exists (case-insensitive status check)
  IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND LOWER(status) = 'active') THEN
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
$function$;