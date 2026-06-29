-- Fix PostgreSQL 42725: "function find_or_create_customer(text, text, text, text) is not unique"
-- which breaks sync_guest_checkout at Guest Info submit.
--
-- Root cause: staging has BOTH
--   • find_or_create_customer(text, text, text, text)           — 4-arg signature
--   • find_or_create_customer(text, text, text, text, text)     — 5-arg with _language DEFAULT NULL
-- A 4-arg call matches both (the 5th param uses its default), so PostgreSQL cannot choose.
-- Same class of issue as 20260408000000_fix_has_role_overload.
--
-- Fix: drop all overloads, keep a single 5-arg canonical function, recreate sync_guest_checkout.

-- 1. Drop every public overload (sync_guest_checkout is recreated in step 3).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'find_or_create_customer'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

-- 2. Single canonical implementation (email fallback + optional language).
CREATE OR REPLACE FUNCTION find_or_create_customer(
  _phone TEXT,
  _first_name TEXT,
  _last_name TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _language TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _customer_id UUID;
  _normalized_phone TEXT;
  _normalized_email TEXT;
  _normalized_language TEXT;
BEGIN
  _normalized_phone := REPLACE(_phone, ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');
  _normalized_language := NULLIF(BTRIM(COALESCE(_language, '')), '');

  SELECT id INTO _customer_id
  FROM customers
  WHERE REPLACE(phone, ' ', '') = _normalized_phone;

  IF _customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      email = COALESCE(_normalized_email, email),
      language = COALESCE(language, _normalized_language)
    WHERE id = _customer_id
      AND (
        (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
        OR (language IS NULL AND _normalized_language IS NOT NULL)
      );
    RETURN _customer_id;
  END IF;

  IF _normalized_email IS NOT NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE LOWER(BTRIM(email)) = LOWER(_normalized_email)
      AND (phone IS NULL OR BTRIM(phone) = '')
    LIMIT 1;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        phone = _normalized_phone,
        first_name = COALESCE(NULLIF(BTRIM(first_name), ''), _first_name),
        last_name  = COALESCE(NULLIF(BTRIM(last_name), ''),  _last_name),
        language   = COALESCE(language, _normalized_language)
      WHERE id = _customer_id;
      RETURN _customer_id;
    END IF;
  END IF;

  INSERT INTO customers (phone, first_name, last_name, email, language)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email, _normalized_language)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE phone = _normalized_phone;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        email = COALESCE(_normalized_email, email),
        language = COALESCE(language, _normalized_language)
      WHERE id = _customer_id
        AND (
          (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
          OR (language IS NULL AND _normalized_language IS NOT NULL)
        );
    END IF;
  END IF;

  RETURN _customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION find_or_create_customer(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION find_or_create_customer(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION find_or_create_customer(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 3. Recreate sync_guest_checkout (dropped by CASCADE) with a disambiguated internal call.
CREATE OR REPLACE FUNCTION sync_guest_checkout(
  _phone              TEXT,
  _first_name         TEXT,
  _client_email       TEXT,
  _hotel_id           TEXT,
  _last_name          TEXT DEFAULT NULL,
  _language           TEXT DEFAULT 'fr',
  _booking_date       DATE DEFAULT NULL,
  _booking_time       TIME DEFAULT NULL,
  _room_number        TEXT DEFAULT NULL,
  _cart_snapshot      JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _customer_id UUID;
BEGIN
  _customer_id := find_or_create_customer(
    _phone      => _phone,
    _first_name => _first_name,
    _last_name  => _last_name,
    _email      => _client_email,
    _language   => _language
  );
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found or created';
  END IF;

  RETURN upsert_checkout_intent(
    _customer_id, _hotel_id, _client_email, _first_name, _last_name,
    _language, _booking_date, _booking_time, _room_number, _cart_snapshot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_guest_checkout(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TEXT, JSONB
) TO anon, authenticated, service_role;
