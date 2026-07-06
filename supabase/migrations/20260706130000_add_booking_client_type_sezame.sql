-- Allow the "sezame" client_type on bookings.
-- Sezame is a wellness partner billed at month-end, like Staycation/ClassPass.
-- The app already exposes it as a first-class booking client type, but the
-- CHECK constraint only permitted hotel/staycation/classpass/external, which
-- made creating/editing a sezame booking fail.
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_client_type_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_client_type_check
  CHECK (client_type IN ('hotel', 'staycation', 'classpass', 'sezame', 'external'));

-- Include sezame in the month-end partner-billing extraction index.
DROP INDEX IF EXISTS idx_bookings_client_type_month;

CREATE INDEX IF NOT EXISTS idx_bookings_client_type_month
  ON bookings (client_type, booking_date)
  WHERE client_type IN ('hotel', 'staycation', 'classpass', 'sezame');
