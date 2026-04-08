-- Migration: Rename app_role enum value 'hairdresser' to 'therapist'
-- This is a metadata-only change (PostgreSQL 10+). The internal OID stays the same,
-- so existing RLS policies that reference 'hairdresser'::app_role continue to work.

ALTER TYPE app_role RENAME VALUE 'hairdresser' TO 'therapist';

-- Create a text-overload of has_role for backward compatibility.
-- The frontend and Edge Functions pass role as a text string via PostgREST.
-- This overload transparently maps 'hairdresser' → 'therapist' so existing
-- code continues to work without changes.
CREATE OR REPLACE FUNCTION has_role(_user_id uuid, _role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = (CASE WHEN _role = 'hairdresser' THEN 'therapist' ELSE _role END)::app_role
  )
$$;

GRANT EXECUTE ON FUNCTION has_role(uuid, text) TO anon, authenticated, service_role;
