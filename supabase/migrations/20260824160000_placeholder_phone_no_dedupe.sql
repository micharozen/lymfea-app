-- Ne jamais dédoublonner les clients sur un téléphone « bouche-trou ».
--
-- Contexte (prod, 24/08) : la fiche client « Mrs Al Babtain » a été créée le
-- 15/07 avec le téléphone +33000000000 (l'opérateur avait tapé 000000000 faute
-- de numéro). find_or_create_customer dédoublonnant uniquement sur le
-- téléphone, toutes les réservations saisies ensuite avec ce même faux numéro
-- ont été rattachées à cette fiche : #1465 (Elias Pearson), #1468 (Nisrine
-- Barhani), #1526 (Julia Mothu). Le planning commodités affichant le nom de la
-- fiche client et non le nom saisi sur la réservation, l'Hôtel de Buci voyait
-- « Mrs Al Babtain » sur des créneaux qui ne la concernaient pas.
--
-- Règle retenue : un téléphone est « bouche-trou » quand
--   * il ne contient aucun chiffre, ou
--   * il ne contient aucun chiffre non nul (0, +0, 0000000000000000), ou
--   * il contient 9 zéros consécutifs ou plus (+33000000000, +1 000000000…).
-- Le seuil de 9 est volontaire : un vrai numéro national compte 9 chiffres
-- après l'indicatif, dont le premier est significatif (06…, 07…), il ne peut
-- donc pas aligner 9 zéros de suite.
--
-- Un tel téléphone est traité comme une absence de téléphone : aucun match, et
-- la fiche est créée avec phone NULL (l'index unique sur phone tolère les NULL
-- multiples). Le repli sur l'email reste actif quand un email est fourni.

CREATE OR REPLACE FUNCTION is_placeholder_phone(_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _phone IS NULL THEN TRUE
    ELSE (
      regexp_replace(_phone, '[^0-9]', '', 'g') !~ '[1-9]'
      OR regexp_replace(_phone, '[^0-9]', '', 'g') ~ '0{9,}'
    )
  END;
$$;

COMMENT ON FUNCTION is_placeholder_phone(TEXT) IS
  'TRUE si le téléphone est un bouche-trou (vide, que des zéros, ou 9 zéros consécutifs) : ne jamais s''en servir comme clé de déduplication client.';

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
  _normalized_phone := REPLACE(COALESCE(_phone, ''), ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');
  _normalized_language := NULLIF(BTRIM(COALESCE(_language, '')), '');
  _normalized_civility := NULLIF(BTRIM(COALESCE(_civility, '')), '');

  -- Téléphone bouche-trou → on l'oublie complètement : ni clé de dédup, ni
  -- valeur stockée. Sinon toutes les réservations sans numéro finissent
  -- agrégées sous la première fiche créée avec ce faux numéro.
  IF is_placeholder_phone(_normalized_phone) THEN
    _normalized_phone := NULL;
  END IF;

  -- 1. Match on phone (primary key for deduplication)
  IF _normalized_phone IS NOT NULL THEN
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
        phone = COALESCE(_normalized_phone, phone),
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
  IF _customer_id IS NULL AND _normalized_phone IS NOT NULL THEN
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

GRANT EXECUTE ON FUNCTION is_placeholder_phone(TEXT) TO "anon", "authenticated", "service_role";
