-- Migration: Add 'offert' to payment_method and payment_status constraints
-- Purpose: Allow offert (complimentary) bookings to be stored with payment_method='offert' and payment_status='offert'

-- Update payment_method constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'tap_to_pay'::text, 'offert'::text]));

-- Update payment_status constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_status_check
CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'charged_to_room'::text, 'failed'::text, 'refunded'::text, 'offert'::text]));
