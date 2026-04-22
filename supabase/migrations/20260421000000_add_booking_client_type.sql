-- Add client_type to bookings: differentiates hotel / staycation / classpass / external clients.
-- Enables per-partner billing at month-end and per-type visual cues in UI.
ALTER TABLE bookings
  ADD COLUMN client_type text NOT NULL DEFAULT 'external'
    CHECK (client_type IN ('hotel', 'staycation', 'classpass', 'external'));

-- Optional reference for paper vouchers redeemed at the venue front desk.
ALTER TABLE bookings
  ADD COLUMN payment_reference text;

-- Extend payment_method CHECK to allow 'voucher' (paid to venue by voucher)
-- and 'partner_billed' (billed to Staycation/ClassPass at month-end).
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (
    payment_method = ANY (ARRAY[
      'room'::text,
      'card'::text,
      'tap_to_pay'::text,
      'offert'::text,
      'gift_amount'::text,
      'voucher'::text,
      'partner_billed'::text
    ])
  );

-- Extend payment_status CHECK to allow 'pending_partner_billing' (staycation/classpass)
-- and 'pending_room_charge' (hotel room charge pending invoice).
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (
    payment_status = ANY (ARRAY[
      'pending'::text,
      'paid'::text,
      'failed'::text,
      'refunded'::text,
      'charged_to_room'::text,
      'pending_partner_billing'::text,
      'pending_room_charge'::text
    ])
  );

-- Partial index to accelerate month-end partner billing extraction (minority of rows).
CREATE INDEX IF NOT EXISTS idx_bookings_client_type_month
  ON bookings (client_type, booking_date)
  WHERE client_type IN ('hotel', 'staycation', 'classpass');
