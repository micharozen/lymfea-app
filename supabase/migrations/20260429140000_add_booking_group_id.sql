-- Add booking_group_id to bookings table.
-- Enables grouping N bookings created from a single multi-time client checkout
-- (PR1 of multi-time booking feature: foundation only — populated in PR2).
--
-- Why nullable: existing single-booking flow does not set this; only multi-item
-- carts where the client picks distinct slots per treatment will populate it.
-- A NULL value means "stand-alone booking" (pre-feature behavior).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_group_id uuid;

COMMENT ON COLUMN public.bookings.booking_group_id IS
  'Groups N bookings created together from one multi-time client checkout. NULL for stand-alone bookings.';

CREATE INDEX IF NOT EXISTS idx_bookings_group_id
  ON public.bookings (booking_group_id)
  WHERE booking_group_id IS NOT NULL;
