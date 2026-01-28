-- Add venue_type to get_public_hotel_by_id function
-- This fixes the issue where anonymous users cannot fetch venue_type due to RLS policies
-- The RPC function uses SECURITY DEFINER to bypass RLS

DROP FUNCTION IF EXISTS public.get_public_hotel_by_id(text);

CREATE FUNCTION public.get_public_hotel_by_id(_hotel_id text)
RETURNS TABLE(
  id text,
  name text,
  image text,
  cover_image text,
  city text,
  country text,
  currency text,
  status text,
  vat numeric,
  opening_time time,
  closing_time time,
  schedule_type text,
  days_of_week integer[],
  recurrence_interval integer,
  recurring_start_date date,
  recurring_end_date date,
  venue_type text
)
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
    h.vat,
    h.opening_time,
    h.closing_time,
    vds.schedule_type::text,
    vds.days_of_week,
    COALESCE(vds.recurrence_interval, 1),
    vds.recurring_start_date,
    vds.recurring_end_date,
    h.venue_type
  FROM public.hotels h
  LEFT JOIN public.venue_deployment_schedules vds ON vds.hotel_id = h.id
  WHERE h.id = _hotel_id
    AND LOWER(h.status) IN ('active', 'actif');
$$;
