-- Migration: Add tap_to_pay payment method
-- Purpose: Support Tap to Pay terminal payments where hairdresser collects directly

-- Drop existing payment_method constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

-- Add new constraint with 'tap_to_pay' value
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'tap_to_pay'::text]));
