-- Modify the handle_new_user function to NOT automatically set status to "Actif"
-- The status should remain "En attente" until the user actually logs in for the first time

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Find matching admin by email and update their user_id
  -- But keep the status as "En attente" until first actual login
  UPDATE public.admins
  SET 
    user_id = NEW.id,
    updated_at = now()
    -- Do NOT change status here - it will stay "En attente"
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- If an admin record was found and updated, assign admin role
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();