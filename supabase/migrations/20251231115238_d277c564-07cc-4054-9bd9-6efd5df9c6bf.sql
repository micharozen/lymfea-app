-- Update the get_public_hotel_by_id function to be case-insensitive for status
CREATE OR REPLACE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(id text, name text, image text, cover_image text, city text, country text, currency text, status text, vat numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    AND LOWER(h.status) IN ('active', 'actif');
$$;

-- Also update get_public_hotels function for consistency
CREATE OR REPLACE FUNCTION public.get_public_hotels()
RETURNS TABLE(id text, name text, image text, cover_image text, city text, country text, currency text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  WHERE LOWER(h.status) IN ('active', 'actif')
  ORDER BY h.name;
$$;