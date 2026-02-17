-- Fix PGRST203: drop the text overload so PostgREST can unambiguously resolve
-- the date version. PostgreSQL handles implicit text→date casting.
DROP FUNCTION IF EXISTS public.is_venue_available_on_date(text, text);
