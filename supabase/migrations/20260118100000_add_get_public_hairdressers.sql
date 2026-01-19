-- Function to get public hairdressers for a specific hotel (for client carousel)
CREATE OR REPLACE FUNCTION public.get_public_hairdressers(_hotel_id text)
RETURNS TABLE (
  id text,
  first_name text,
  profile_image text,
  skills text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.first_name,
    h.profile_image,
    h.skills
  FROM public.hairdressers h
  INNER JOIN public.hairdresser_hotels hh ON h.id = hh.hairdresser_id
  WHERE hh.hotel_id = _hotel_id
    AND h.status IN ('Active', 'Actif', 'active')
  ORDER BY h.first_name;
$$;
