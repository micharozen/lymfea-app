-- Extend find_or_create_customer with an optional civility (title).
--
-- Context: admin/concierge booking creation collects the client's civility
-- ('madame' | 'monsieur') and passes it here so it is stored on the customer
-- record and reused in confirmation/pending/payment greetings.
--
-- Rules (mirror the existing _language handling):
--   * On INSERT, store the provided civility.
--   * On an existing customer, only fill in the civility when it is currently
--     NULL (COALESCE) — never clobber a value already on record.
CREATE OR REPLACE FUNCTION find_or_create_customer(
  _phone TEXT,
  _first_name TEXT,
  _last_name TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _language TEXT DEFAULT NULL,
  _civility TEXT DEFAULT NULL
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
  _normalized_civility TEXT;
BEGIN
  _normalized_phone := REPLACE(_phone, ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');
  _normalized_language := NULLIF(BTRIM(COALESCE(_language, '')), '');
  _normalized_civility := NULLIF(BTRIM(COALESCE(_civility, '')), '');

  -- 1. Match on phone (primary key for deduplication)
  SELECT id INTO _customer_id
  FROM customers
  WHERE REPLACE(phone, ' ', '') = _normalized_phone;

  IF _customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      email = COALESCE(_normalized_email, email),
      language = COALESCE(language, _normalized_language),
      civility = COALESCE(civility, _normalized_civility)
    WHERE id = _customer_id
      AND (
        (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
        OR (language IS NULL AND _normalized_language IS NOT NULL)
        OR (civility IS NULL AND _normalized_civility IS NOT NULL)
      );
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
        last_name  = COALESCE(NULLIF(BTRIM(last_name), ''),  _last_name),
        language   = COALESCE(language, _normalized_language),
        civility   = COALESCE(civility, _normalized_civility)
      WHERE id = _customer_id;
      RETURN _customer_id;
    END IF;
  END IF;

  -- 3. No match at all — insert new customer
  INSERT INTO customers (phone, first_name, last_name, email, language, civility)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email, _normalized_language, _normalized_civility)
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO _customer_id;

  -- 4. Handle rare race condition: another session inserted same phone concurrently
  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE phone = _normalized_phone;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        email = COALESCE(_normalized_email, email),
        language = COALESCE(language, _normalized_language),
        civility = COALESCE(civility, _normalized_civility)
      WHERE id = _customer_id
        AND (
          (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
          OR (language IS NULL AND _normalized_language IS NOT NULL)
          OR (civility IS NULL AND _normalized_civility IS NOT NULL)
        );
    END IF;
  END IF;

  RETURN _customer_id;
END;
$$;
