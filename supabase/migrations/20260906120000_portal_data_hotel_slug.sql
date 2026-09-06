-- Portail client : exposer le lieu (id + slug) dans get_customer_portal_data
-- afin de pouvoir renvoyer le client vers /client/<slug>/treatments depuis son espace.
-- Seul ajout : hotel_slug sur les cartes cadeaux et les réservations
-- (+ hotel_id sur les réservations). Le reste de la fonction est inchangé.

CREATE OR REPLACE FUNCTION get_customer_portal_data()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_user_id UUID;
  _customer customers%ROWTYPE;
  _gift_cards JSON;
  _upcoming_bookings JSON;
  _past_bookings JSON;
  _result JSON;
BEGIN
  _auth_user_id := auth.uid();

  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find customer by auth_user_id
  SELECT * INTO _customer
  FROM customers
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  -- Gift cards / bundles where this customer is the beneficiary
  SELECT COALESCE(json_agg(gc ORDER BY gc.created_at DESC), '[]'::JSON)
  INTO _gift_cards
  FROM (
    SELECT
      ctb.id,
      ctb.bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      tb.cover_image_url,
      ctb.total_sessions,
      ctb.used_sessions,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      ctb.status,
      ctb.expires_at,
      ctb.is_gift,
      ctb.sender_name,
      ctb.gift_message,
      ctb.claimed_at,
      ctb.created_at,
      ctb.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    LEFT JOIN hotels h ON h.id = ctb.hotel_id
    WHERE ctb.beneficiary_customer_id = _customer.id
  ) gc;

  -- Upcoming bookings (today or future)
  SELECT COALESCE(json_agg(ub ORDER BY ub.booking_date ASC, ub.booking_time ASC), '[]'::JSON)
  INTO _upcoming_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      b.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = _customer.id
      AND b.booking_date >= CURRENT_DATE
      AND b.status NOT IN ('cancelled', 'no_show')
    LIMIT 20
  ) ub;

  -- Past bookings
  SELECT COALESCE(json_agg(pb ORDER BY pb.booking_date DESC), '[]'::JSON)
  INTO _past_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      b.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = _customer.id
      AND b.booking_date < CURRENT_DATE
    ORDER BY b.booking_date DESC
    LIMIT 50
  ) pb;

  -- Build result
  _result := json_build_object(
    'customer', json_build_object(
      'id', _customer.id,
      'first_name', _customer.first_name,
      'last_name', _customer.last_name,
      'email', _customer.email,
      'phone', _customer.phone
    ),
    'gift_cards', _gift_cards,
    'upcoming_bookings', _upcoming_bookings,
    'past_bookings', _past_bookings
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_portal_data() TO authenticated;
