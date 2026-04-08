-- Fix PGRST203: drop the text overload so PostgREST has no ambiguity.
-- RLS policies depend on has_role(uuid, app_role), so we keep that one.
-- With only one signature, PostgREST will auto-cast text to app_role.
DROP FUNCTION IF EXISTS has_role(uuid, text);
