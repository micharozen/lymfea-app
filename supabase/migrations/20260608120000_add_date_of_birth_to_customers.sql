-- Add date_of_birth to customers for the Fresha client import.
--
-- The Fresha export carries a "Date de naissance" field for a subset of
-- clients. `customers` had no place to store it, so add a nullable date column.
-- All other Fresha-only fields (gender, address, marketing consent, referral
-- source, tags) are intentionally not imported.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS date_of_birth date;
