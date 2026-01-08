-- Update get_public_treatments to exclude treatments with NULL hotel_id
CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
 RETURNS TABLE(id uuid, name text, description text, category text, service_for text, duration integer, price numeric, price_on_request boolean, lead_time integer, image text, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$function$;