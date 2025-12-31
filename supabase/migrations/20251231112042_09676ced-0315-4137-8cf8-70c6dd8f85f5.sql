-- Add timezone column to hotels table
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Paris';

-- Create profiles table for user preferences
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT DEFAULT 'Europe/Paris',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles table
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" 
ON public.profiles FOR UPDATE 
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Block anonymous access
CREATE POLICY "Block anonymous access to profiles" 
ON public.profiles FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create trigger to update updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create profile with timezone from hotel assignment
CREATE OR REPLACE FUNCTION public.sync_profile_timezone_from_hotel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _hotel_timezone TEXT;
BEGIN
  -- Get user_id and hotel timezone for concierge
  IF TG_TABLE_NAME = 'concierge_hotels' THEN
    SELECT c.user_id INTO _user_id 
    FROM concierges c 
    WHERE c.id = NEW.concierge_id;
    
    SELECT h.timezone INTO _hotel_timezone 
    FROM hotels h 
    WHERE h.id = NEW.hotel_id;
  -- Get user_id and hotel timezone for hairdresser
  ELSIF TG_TABLE_NAME = 'hairdresser_hotels' THEN
    SELECT h.user_id INTO _user_id 
    FROM hairdressers h 
    WHERE h.id = NEW.hairdresser_id;
    
    SELECT ht.timezone INTO _hotel_timezone 
    FROM hotels ht 
    WHERE ht.id = NEW.hotel_id;
  END IF;
  
  -- Only proceed if we have a user_id and timezone
  IF _user_id IS NOT NULL AND _hotel_timezone IS NOT NULL THEN
    INSERT INTO profiles (user_id, timezone)
    VALUES (_user_id, _hotel_timezone)
    ON CONFLICT (user_id) 
    DO UPDATE SET timezone = _hotel_timezone, updated_at = now()
    WHERE profiles.timezone = 'Europe/Paris'; -- Only update if still default
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for concierge hotel assignments
CREATE TRIGGER sync_concierge_timezone
AFTER INSERT ON public.concierge_hotels
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_timezone_from_hotel();

-- Trigger for hairdresser hotel assignments
CREATE TRIGGER sync_hairdresser_timezone
AFTER INSERT ON public.hairdresser_hotels
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_timezone_from_hotel();

-- Function to get user's effective timezone
CREATE OR REPLACE FUNCTION public.get_user_timezone(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT timezone FROM profiles WHERE user_id = _user_id),
    'Europe/Paris'
  );
$$;