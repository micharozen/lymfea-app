-- Find or create a customer by phone number
-- Used during booking creation to auto-populate the customers table
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
BEGIN
  -- Normalize phone: remove all spaces
  _normalized_phone := REPLACE(_phone, ' ', '');

  -- Try to find existing customer by normalized phone
  SELECT id INTO _customer_id
  FROM customers
  WHERE REPLACE(phone, ' ', '') = _normalized_phone;

  IF _customer_id IS NOT NULL THEN
    RETURN _customer_id;
  END IF;

  -- Create new customer
  INSERT INTO customers (phone, first_name, last_name, email)
  VALUES (_normalized_phone, _first_name, _last_name, _email)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

  -- Race condition fallback: concurrent insert won
  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE phone = _normalized_phone;
  END IF;

  RETURN _customer_id;
END;
$$;
