-- Migration: Add 'awaiting_payment' to bookings.payment_status constraint
-- Purpose: Support pre-reserved Stripe Checkout bookings with payment_status='awaiting_payment'
-- These bookings hold a treatment room for 4 minutes while the client completes payment.

-- Drop existing payment_status constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

-- Re-create constraint including 'awaiting_payment' alongside existing statuses
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_status_check
CHECK (
  payment_status = ANY (
    ARRAY[
      'pending'::text,
      'awaiting_payment'::text,
      'paid'::text,
      'charged_to_room'::text,
      'failed'::text,
      'refunded'::text,
      'offert'::text
    ]
  )
);

-- Index for cron cleanup of expired pre-reservations
CREATE INDEX IF NOT EXISTS idx_bookings_awaiting_payment
ON bookings (payment_status, created_at)
WHERE payment_status = 'awaiting_payment';
