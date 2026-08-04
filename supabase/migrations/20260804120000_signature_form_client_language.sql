-- ==============================================================================
-- Migration : signature_form_client_language
-- Description : Le formulaire de consentement / décharge client doit s'afficher
--               dans la langue du client. On expose donc la langue résolue dans
--               get_booking_by_signature_token.
--
--               Résolution (identique aux notifications) :
--                 1. customers.language (source de vérité)
--                 2. repli sur l'indicatif du téléphone (+33 => fr, autre => en)
--                 3. défaut 'fr'
--               bookings.language est dépréciée et n'est volontairement pas lue.
--
--               treatment_name ne renvoie plus de libellé français en dur :
--               NULL est retourné quand aucun soin n'est rattaché, le front
--               affiche alors un libellé traduit.
-- ==============================================================================

DROP FUNCTION IF EXISTS get_booking_by_signature_token(TEXT);

CREATE OR REPLACE FUNCTION get_booking_by_signature_token(p_token TEXT)
RETURNS TABLE (
    client_first_name TEXT,
    client_last_name TEXT,
    hotel_name TEXT,
    treatment_name TEXT,
    total_price NUMERIC,
    client_language TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.client_first_name,
        b.client_last_name,
        b.hotel_name,
        (
            SELECT string_agg(tm.name, ', ')
            FROM booking_treatments bt
            JOIN treatment_menus tm ON bt.treatment_id = tm.id
            WHERE bt.booking_id = b.id
        ) AS treatment_name,
        b.total_price,
        COALESCE(
            NULLIF(c.language, ''),
            CASE
                WHEN c.phone IS NULL OR btrim(c.phone) = '' THEN 'fr'
                WHEN btrim(c.phone) LIKE '+33%' OR btrim(c.phone) LIKE '0033%' THEN 'fr'
                WHEN btrim(c.phone) LIKE '+%' OR btrim(c.phone) LIKE '00%' THEN 'en'
                ELSE 'fr'
            END
        ) AS client_language
    FROM bookings b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE b.signature_token = p_token
    AND b.signed_at IS NULL;
END;
$$;
