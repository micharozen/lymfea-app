-- Update the handle_new_user function to also handle hairdressers
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
    RETURN NEW;
  END IF;
  
  -- Find matching hairdresser by email and update their user_id
  UPDATE public.hairdressers
  SET 
    user_id = NEW.id,
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If a hairdresser record was found and updated, assign hairdresser role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'hairdresser')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;