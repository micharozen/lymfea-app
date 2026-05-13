-- Cancellation audit columns on bookings (cancellation_reason TEXT already exists)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by            UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id        TEXT;

-- Cancellation policy per venue
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_type   TEXT DEFAULT 'none'
    CHECK (cancellation_fee_type IN ('none', 'fixed', 'percentage'));
