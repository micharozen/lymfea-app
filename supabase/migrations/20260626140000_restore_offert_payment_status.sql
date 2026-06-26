-- Migration: Restore 'offert' to the payment_status check constraint
-- Purpose: The complimentary (offert) booking feature stores bookings with
--   payment_status = 'offert'. This value was originally allowed by
--   20260220100000_add_offert_payment_method_and_status.sql, but was dropped
--   when 20260422120000_add_booking_client_type.sql redefined the constraint
--   without including 'offert'. As a result, creating an offert booking fails
--   with "bookings_payment_status_check" violation.
-- Note: payment_method = 'offert' is still allowed (see 20260416120000), only
--   payment_status needs to be restored.

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (
    payment_status = ANY (ARRAY[
      'pending'::text,
      'awaiting_payment'::text,
      'paid'::text,
      'failed'::text,
      'refunded'::text,
      'charged'::text,
      'charged_to_room'::text,
      'card_saved'::text,
      'expired'::text,
      'pending_partner_billing'::text,
      'pending_room_charge'::text,
      'offert'::text
    ])
  );
