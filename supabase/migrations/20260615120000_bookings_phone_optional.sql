-- Make bookings.phone optional.
--
-- Admins need to record bookings for which they have neither a phone nor an
-- email (e.g. backfilling historical walk-ins). The column was NOT NULL, which
-- forced a placeholder value. Allowing NULL lets these bookings stay unlinked
-- to any customer rather than collapsing them onto a shared fake phone number.
ALTER TABLE public.bookings
  ALTER COLUMN phone DROP NOT NULL;
