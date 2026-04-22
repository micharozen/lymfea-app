-- Customer Portal: RPC for dashboard data + RLS policies for authenticated customers
-- Enables customers with auth accounts (role='user') to read their own data.

-- ============================================================================
-- 1. RPC: get_customer_portal_data
--    Returns all portal dashboard data for the authenticated customer in one call.
-- ============================================================================

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
      h.name AS hotel_name
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
      h.name AS hotel_name,
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
      h.name AS hotel_name,
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

-- ============================================================================
-- 2. RLS policies for customer self-access
-- ============================================================================

-- customers: read own record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Customer can read own profile' AND tablename = 'customers'
  ) THEN
    CREATE POLICY "Customer can read own profile"
      ON customers FOR SELECT
      TO authenticated
      USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- customers: update own record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Customer can update own profile' AND tablename = 'customers'
  ) THEN
    CREATE POLICY "Customer can update own profile"
      ON customers FOR UPDATE
      TO authenticated
      USING (auth_user_id = auth.uid())
      WITH CHECK (auth_user_id = auth.uid());
  END IF;
END $$;

-- customer_treatment_bundles: read own bundles (as beneficiary)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Customer can read own bundles' AND tablename = 'customer_treatment_bundles'
  ) THEN
    CREATE POLICY "Customer can read own bundles"
      ON customer_treatment_bundles FOR SELECT
      TO authenticated
      USING (
        beneficiary_customer_id IN (
          SELECT id FROM customers WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- bookings: read own bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Customer can read own bookings' AND tablename = 'bookings'
  ) THEN
    CREATE POLICY "Customer can read own bookings"
      ON bookings FOR SELECT
      TO authenticated
      USING (
        customer_id IN (
          SELECT id FROM customers WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;
