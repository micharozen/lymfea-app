-- Add 'cash' to payment_method constraint
-- Allows bookings marked as paid in cash ("Espèces") from the admin booking detail

ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'tap_to_pay'::text, 'offert'::text, 'gift_amount'::text, 'voucher'::text, 'partner_billed'::text, 'cash'::text]));
