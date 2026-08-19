-- ==============================================================================
-- resume_checkout_intent renvoie aussi le téléphone du client.
--
-- Un checkout intent n'existe que si le visiteur a saisi email ET téléphone
-- (voir GuestInfo.tsx, `shouldTrackCheckoutIntent`). Le numéro est stocké sur
-- `customers` par find_or_create_customer, jamais sur checkout_intents : la
-- reprise le redemandait donc alors qu'on le possède déjà.
--
-- Le retour change de forme : CREATE OR REPLACE refuserait (42P13), d'où le
-- DROP préalable.
-- ==============================================================================

DROP FUNCTION IF EXISTS resume_checkout_intent(UUID);

CREATE FUNCTION resume_checkout_intent(_token UUID)
RETURNS TABLE (
  hotel_id          TEXT,
  hotel_slug        TEXT,
  cart_snapshot     JSONB,
  booking_date      DATE,
  booking_time      TIME,
  room_number       TEXT,
  client_first_name TEXT,
  client_last_name  TEXT,
  client_email      TEXT,
  client_phone      TEXT,
  language          TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ci.hotel_id,
    h.slug,
    ci.cart_snapshot,
    ci.booking_date,
    ci.booking_time,
    ci.room_number,
    ci.client_first_name,
    ci.client_last_name,
    ci.client_email,
    c.phone,
    ci.language
  FROM checkout_intents ci
  JOIN hotels h ON h.id = ci.hotel_id
  LEFT JOIN customers c ON c.id = ci.customer_id
  WHERE ci.resume_token = _token
    AND ci.converted_at IS NULL
    AND ci.created_at > now() - INTERVAL '30 days';
$$;

REVOKE ALL ON FUNCTION resume_checkout_intent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resume_checkout_intent(UUID) TO anon, authenticated, service_role;
