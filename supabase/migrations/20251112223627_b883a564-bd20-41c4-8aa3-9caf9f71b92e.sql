-- Update the function to also link the admin record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the new user is tom@oomworld.com, assign admin role and update admin record
  IF NEW.email = 'tom@oomworld.com' THEN
    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Update admin record with user_id
    UPDATE public.admins
    SET user_id = NEW.id
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;