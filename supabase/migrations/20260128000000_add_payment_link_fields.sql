-- Migration: Add payment link fields to bookings table
-- Allows tracking of Stripe Payment Links sent to clients via email/WhatsApp

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_link_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_link_channels TEXT[];
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_link_language TEXT CHECK (payment_link_language IN ('fr', 'en'));

-- Index for querying bookings with payment links
CREATE INDEX IF NOT EXISTS idx_bookings_payment_link_sent
ON bookings (payment_link_sent_at)
WHERE payment_link_url IS NOT NULL;

COMMENT ON COLUMN bookings.payment_link_url IS 'Stripe Payment Link URL sent to client';
COMMENT ON COLUMN bookings.payment_link_sent_at IS 'Timestamp when payment link was sent';
COMMENT ON COLUMN bookings.payment_link_channels IS 'Channels used to send link: email, whatsapp';
COMMENT ON COLUMN bookings.payment_link_language IS 'Language of the payment link message: fr or en';
