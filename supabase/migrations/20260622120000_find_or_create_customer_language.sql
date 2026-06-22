-- Extend find_or_create_customer with an optional language preference.
--
-- Context: admin/phone-FAB booking creation derives the client's communication
-- language from the phone country code (+33 → 'fr', otherwise 'en') and passes
-- it here so confirmation SMS/emails are sent in the right language. Notification
-- edge functions read `customers.language` to pick the FR/EN template.
--
-- Rules:
--   * On INSERT, store the provided language.
--   * On an existing customer, only fill in the language when it is currently
--     NULL (COALESCE) — never clobber an explicit preference already on record
--     (e.g. a language the client chose themselves in the client booking flow).
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

  -- 1. Match on phone (primary key for deduplication)
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
        language   = COALESCE(language, _normalized_language)
      WHERE id = _customer_id;
      RETURN _customer_id;
    END IF;
  END IF;

  -- 3. No match at all — insert new customer
  INSERT INTO customers (phone, first_name, last_name, email, language)
  VALUES (_normalized_phone, _first_name, _last_name, _normalized_email, _normalized_language)
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
