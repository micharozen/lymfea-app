-- Update the handle_new_user trigger to automatically set admin status to "Actif" on first login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Find matching admin by email and update their record
  UPDATE public.admins
  SET 
    user_id = NEW.id,
    status = 'Actif',  -- Automatically set status to "Actif" on first login
    updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If an admin record was found and updated, assign admin role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;