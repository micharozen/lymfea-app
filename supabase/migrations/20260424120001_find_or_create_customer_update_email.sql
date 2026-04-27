-- Update find_or_create_customer to also refresh an existing customer's
-- email when a new one is provided. This is needed when an operator edits
-- the email in the FAB / phone booking flow — previously the existing
-- customer record was returned as-is and the edited email was lost.
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

  INSERT INTO customers (phone, first_name, last_name, email)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

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
