-- Remove legacy global admin late-fee policy on hotels.
-- Policy is now driven by cancellation tiers only.

ALTER TABLE public.hotels
  DROP COLUMN IF EXISTS cancellation_fee_type,
  DROP COLUMN IF EXISTS cancellation_fee_amount;

