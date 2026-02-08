-- Migration: Add payment failed status and error tracking
-- Created: 2026-02-07
-- Purpose: Track payment failures with detailed error information for admin notifications

-- Step 1: Drop existing payment_status constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

-- Step 2: Add new constraint with 'failed' and 'refunded' statuses
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_status_check
CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'charged_to_room'::text, 'failed'::text, 'refunded'::text]));

-- Step 3: Add columns for storing payment error details
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS payment_error_code TEXT,
ADD COLUMN IF NOT EXISTS payment_error_message TEXT,
ADD COLUMN IF NOT EXISTS payment_error_details JSONB;

-- Step 4: Create index for filtering failed payments
CREATE INDEX IF NOT EXISTS idx_bookings_payment_failed
ON bookings(payment_status)
WHERE payment_status = 'failed';

-- Step 5: Add column comments for documentation
COMMENT ON COLUMN bookings.payment_error_code IS 'Code d''erreur Stripe (card_declined, insufficient_funds, expired_card, etc.)';
COMMENT ON COLUMN bookings.payment_error_message IS 'Message d''erreur lisible par humain pour affichage dans l''UI';
COMMENT ON COLUMN bookings.payment_error_details IS 'Détails JSON de l''erreur: decline_code, network_decline_code, last4, brand, timestamp';
