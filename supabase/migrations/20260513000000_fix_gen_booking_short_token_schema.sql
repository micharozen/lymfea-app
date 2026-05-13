-- Fix: public.gen_booking_short_token() failed with
--   "function gen_random_bytes(integer) does not exist"
-- because pgcrypto lives in the `extensions` schema on Supabase, and the
-- function (defined as SECURITY INVOKER on `public`) does not have
-- `extensions` on its search_path. The booking row insert triggered by
-- reserve_trunk_atomically evaluates the column DEFAULT
-- `public.gen_booking_short_token()`, which then blew up.
--
-- Fix: qualify the call as `extensions.gen_random_bytes(8)` to match the
-- pattern already used elsewhere in this codebase
-- (e.g. 20260331120000_add_client_signature_logic.sql).

CREATE OR REPLACE FUNCTION public.gen_booking_short_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i int;
  bytes bytea;
BEGIN
  FOR attempt IN 1..5 LOOP
    result := '';
    bytes := extensions.gen_random_bytes(8);
    FOR i IN 0..7 LOOP
      result := result || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE short_token = result) THEN
      RETURN result;
    END IF;
  END LOOP;

  RETURN result || extract(epoch from clock_timestamp())::bigint::text;
END;
$$;
