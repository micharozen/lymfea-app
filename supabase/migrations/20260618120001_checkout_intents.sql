-- Checkout intents: pre-booking abandon tracking (no email/cron/resume layer).
-- Guest Info submit → sync_guest_checkout; booking creation → mark converted (service_role only).

-- ─── checkout_intents table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkout_intents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  hotel_id          TEXT NOT NULL REFERENCES hotels(id),
  booking_date      DATE,
  booking_time      TIME,
  client_email      TEXT NOT NULL,
  client_first_name TEXT NOT NULL,
  client_last_name  TEXT,
  language          TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  room_number       TEXT,
  cart_snapshot     JSONB NOT NULL,
  converted_at      TIMESTAMPTZ,
  booking_id        UUID REFERENCES bookings(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_intents_one_open_per_customer_hotel
  ON checkout_intents (customer_id, hotel_id)
  WHERE converted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_intents_hotel_created
  ON checkout_intents (hotel_id, created_at DESC);

CREATE TRIGGER checkout_intents_updated_at
  BEFORE UPDATE ON checkout_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE checkout_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checkout_intents" ON checkout_intents
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view checkout_intents from their hotels" ON checkout_intents
  FOR SELECT USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Block anonymous access to checkout_intents" ON checkout_intents
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON checkout_intents TO anon, authenticated, service_role;

-- ─── upsert_checkout_intent (internal — called by sync_guest_checkout) ───────
CREATE OR REPLACE FUNCTION upsert_checkout_intent(
  _customer_id        UUID,
  _hotel_id           TEXT,
  _client_email       TEXT,
  _client_first_name  TEXT,
  _client_last_name   TEXT DEFAULT NULL,
  _language           TEXT DEFAULT 'fr',
  _booking_date       DATE DEFAULT NULL,
  _booking_time       TIME DEFAULT NULL,
  _room_number        TEXT DEFAULT NULL,
  _cart_snapshot      JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _intent_id UUID;
  _lang TEXT;
BEGIN
  _lang := CASE WHEN _language IN ('fr', 'en') THEN _language ELSE 'fr' END;

  INSERT INTO checkout_intents (
    customer_id, hotel_id, booking_date, booking_time,
    client_email, client_first_name, client_last_name,
    language, room_number, cart_snapshot
  ) VALUES (
    _customer_id, _hotel_id, _booking_date, _booking_time,
    _client_email, _client_first_name, _client_last_name,
    _lang, _room_number, _cart_snapshot
  )
  ON CONFLICT (customer_id, hotel_id) WHERE converted_at IS NULL
  DO UPDATE SET
    booking_date      = EXCLUDED.booking_date,
    booking_time      = EXCLUDED.booking_time,
    client_email      = EXCLUDED.client_email,
    client_first_name = EXCLUDED.client_first_name,
    client_last_name  = EXCLUDED.client_last_name,
    language          = EXCLUDED.language,
    room_number       = EXCLUDED.room_number,
    cart_snapshot     = EXCLUDED.cart_snapshot,
    updated_at        = now()
  RETURNING id INTO _intent_id;

  RETURN _intent_id;
END;
$$;

REVOKE ALL ON FUNCTION upsert_checkout_intent(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_checkout_intent(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TEXT, JSONB
) TO service_role;

-- ─── sync_guest_checkout (anon-safe: customer + intent in one call) ─────────
CREATE OR REPLACE FUNCTION sync_guest_checkout(
  _phone              TEXT,
  _first_name         TEXT,
  _client_email       TEXT,
  _hotel_id           TEXT,
  _last_name          TEXT DEFAULT NULL,
  _language           TEXT DEFAULT 'fr',
  _booking_date       DATE DEFAULT NULL,
  _booking_time       TIME DEFAULT NULL,
  _room_number        TEXT DEFAULT NULL,
  _cart_snapshot      JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _customer_id UUID;
BEGIN
  _customer_id := find_or_create_customer(_phone, _first_name, _last_name, _client_email);
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found or created';
  END IF;

  RETURN upsert_checkout_intent(
    _customer_id, _hotel_id, _client_email, _first_name, _last_name,
    _language, _booking_date, _booking_time, _room_number, _cart_snapshot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_guest_checkout(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TEXT, JSONB
) TO anon, authenticated, service_role;

-- ─── mark_checkout_intent_converted (edge functions only) ───────────────────
CREATE OR REPLACE FUNCTION mark_checkout_intent_converted(
  _intent_id   UUID,
  _booking_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE checkout_intents
  SET converted_at = now(), booking_id = _booking_id
  WHERE id = _intent_id
    AND converted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION mark_checkout_intent_converted(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_checkout_intent_converted(UUID, UUID) TO service_role;
