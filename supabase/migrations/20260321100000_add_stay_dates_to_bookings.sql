-- Store PMS guest stay dates on bookings for future use (reporting, analytics)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pms_guest_check_in timestamptz,
  ADD COLUMN IF NOT EXISTS pms_guest_check_out timestamptz;
