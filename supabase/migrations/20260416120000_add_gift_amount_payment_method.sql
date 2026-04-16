-- Add 'gift_amount' to payment_method constraint
-- Allows bookings paid via gift card amount balance

ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'tap_to_pay'::text, 'offert'::text, 'gift_amount'::text]));
