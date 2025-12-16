-- Fix: Drop the SECURITY DEFINER view and use a regular view instead
-- The view doesn't need SECURITY DEFINER since it just selects public columns
DROP VIEW IF EXISTS public.hairdresser_public_info;

-- Create a regular view (inherits RLS from the underlying table)
CREATE VIEW public.hairdresser_public_info AS
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