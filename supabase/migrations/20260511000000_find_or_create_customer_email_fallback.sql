-- Extend find_or_create_customer with email-based fallback deduplication.
--
-- Problem: when a customer was created without a phone (e.g. via gift card purchase
-- before phone was mandatory), a second call with phone + same email would fail the
-- phone match and INSERT a new row, splitting the customer's history.
--
-- Fix: if no phone match AND email is provided, look for a customer whose phone is
-- NULL or empty and whose email matches. If found, update their phone and return
-- that customer instead of inserting a duplicate.
CREATE OR REPLACE FUNCTION find_or_create_customer(
  _phone TEXT,
  _first_name TEXT,
  _last_name TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _customer_id UUID;
  _normalized_phone TEXT;
  _normalized_email TEXT;
BEGIN
  _normalized_phone := REPLACE(_phone, ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');

  -- 1. Match on phone (primary key for deduplication)
  SELECT id INTO _customer_id
  FROM customers
  WHERE REPLACE(phone, ' ', '') = _normalized_phone;

  IF _customer_id IS NOT NULL THEN
    IF _normalized_email IS NOT NULL THEN
      UPDATE customers
      SET email = _normalized_email
      WHERE id = _customer_id
        AND (email IS DISTINCT FROM _normalized_email);
    END IF;
    RETURN _customer_id;
  END IF;

  -- 2. Email fallback: find a customer with same email but no phone yet.
  --    Merge instead of creating a duplicate.
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
        last_name  = COALESCE(NULLIF(BTRIM(last_name), ''),  _last_name)
      WHERE id = _customer_id;
      RETURN _customer_id;
    END IF;
  END IF;

  -- 3. No match at all — insert new customer
  INSERT INTO customers (phone, first_name, last_name, email)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

  -- 4. Handle rare race condition: another session inserted same phone concurrently
  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE phone = _normalized_phone;

    IF _customer_id IS NOT NULL AND _normalized_email IS NOT NULL THEN
      UPDATE customers
      SET email = _normalized_email
      WHERE id = _customer_id
        AND (email IS DISTINCT FROM _normalized_email);
    END IF;
  END IF;

  RETURN _customer_id;
END;
$$;
