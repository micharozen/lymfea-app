-- Réparation des fiches clients agrégées à tort sur un téléphone bouche-trou.
--
-- Suite directe de 20260824160000_placeholder_phone_no_dedupe.sql : la
-- déduplication ne produira plus ce cas, mais les données déjà en base restent
-- fusionnées. En prod, la fiche « Mrs Al Babtain » (+33000000000) porte quatre
-- réservations appartenant à quatre clients différents.
--
-- Principe : sur une fiche au téléphone bouche-trou, la réservation la plus
-- ancienne garde la fiche (c'est elle qui lui a donné son nom) ; toute autre
-- réservation dont l'identité saisie diffère reçoit sa propre fiche, et les
-- réservations de commodité liées suivent. Enfin, le faux numéro est effacé
-- pour ne pas envoyer de SMS dans le vide.
--
-- Idempotent : après passage, plus aucune fiche ne porte de téléphone
-- bouche-trou, donc un second passage ne fait rien.

DO $$
DECLARE
  _row RECORD;
  _new_customer_id UUID;
BEGIN
  FOR _row IN
    WITH placeholder_customers AS (
      SELECT id, first_name, last_name, language, civility
      FROM customers
      WHERE is_placeholder_phone(phone)
        AND phone IS NOT NULL
    ),
    ranked AS (
      SELECT
        b.id AS booking_id,
        b.customer_id,
        b.client_first_name,
        b.client_last_name,
        b.client_email,
        -- bookings.language est dépréciée : la langue et la civilité sont
        -- héritées de la fiche d'origine, seule source encore fiable.
        pc.language,
        pc.civility,
        pc.first_name AS customer_first_name,
        pc.last_name AS customer_last_name,
        ROW_NUMBER() OVER (PARTITION BY b.customer_id ORDER BY b.created_at) AS rn
      FROM bookings b
      JOIN placeholder_customers pc ON pc.id = b.customer_id
    )
    SELECT *
    FROM ranked
    WHERE rn > 1
      AND LOWER(BTRIM(COALESCE(client_first_name, '') || ' ' || COALESCE(client_last_name, '')))
          IS DISTINCT FROM
          LOWER(BTRIM(COALESCE(customer_first_name, '') || ' ' || COALESCE(customer_last_name, '')))
    ORDER BY booking_id
  LOOP
    INSERT INTO customers (phone, first_name, last_name, email, language, civility)
    VALUES (
      NULL,
      NULLIF(BTRIM(COALESCE(_row.client_first_name, '')), ''),
      NULLIF(BTRIM(COALESCE(_row.client_last_name, '')), ''),
      NULLIF(BTRIM(COALESCE(_row.client_email, '')), ''),
      _row.language,
      _row.civility
    )
    RETURNING id INTO _new_customer_id;

    UPDATE bookings
    SET customer_id = _new_customer_id
    WHERE id = _row.booking_id;

    UPDATE amenity_bookings
    SET customer_id = _new_customer_id
    WHERE linked_booking_id = _row.booking_id;

    RAISE NOTICE 'Booking % détaché de la fiche % vers la nouvelle fiche %',
      _row.booking_id, _row.customer_id, _new_customer_id;
  END LOOP;
END $$;

-- Le faux numéro n'a plus aucune valeur : il ne sert plus de clé de dédup et
-- ferait échouer (ou pire, partir dans le vide) tout envoi SMS.
UPDATE customers
SET phone = NULL
WHERE phone IS NOT NULL
  AND is_placeholder_phone(phone);
