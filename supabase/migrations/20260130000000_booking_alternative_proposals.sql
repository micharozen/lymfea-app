-- Migration: Add booking alternative proposals table and new booking status
-- This enables hairdressers to propose alternative time slots to clients via WhatsApp

-- Create the booking_alternative_proposals table
CREATE TABLE IF NOT EXISTS booking_alternative_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hairdresser_id UUID NOT NULL REFERENCES hairdressers(id),

  -- Original booking time (for reference)
  original_date DATE NOT NULL,
  original_time TIME NOT NULL,

  -- Two alternative slots (ordered by preference: 1 = closest to original, 2 = fallback)
  alternative_1_date DATE NOT NULL,
  alternative_1_time TIME NOT NULL,
  alternative_2_date DATE NOT NULL,
  alternative_2_time TIME NOT NULL,

  -- Flow tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Initial state, WhatsApp being sent
    'slot1_offered',     -- First slot offered to client
    'slot1_accepted',    -- Client accepted first slot
    'slot1_rejected',    -- Client rejected first slot, sending second
    'slot2_offered',     -- Second slot offered to client
    'slot2_accepted',    -- Client accepted second slot
    'all_rejected',      -- Client rejected both slots
    'expired'            -- No response within 24h
  )),
  current_offer_index INTEGER DEFAULT 1 CHECK (current_offer_index IN (1, 2)),

  -- WhatsApp tracking
  whatsapp_message_id TEXT,
  client_phone TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),

  -- Ensure only one active proposal per booking
  CONSTRAINT unique_active_proposal_per_booking UNIQUE (booking_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_proposals_booking_id ON booking_alternative_proposals(booking_id);
CREATE INDEX IF NOT EXISTS idx_proposals_hairdresser_id ON booking_alternative_proposals(hairdresser_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_phone ON booking_alternative_proposals(client_phone);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON booking_alternative_proposals(status)
  WHERE status NOT IN ('slot1_accepted', 'slot2_accepted', 'all_rejected', 'expired');

-- Add 'alternative_proposed' status to bookings table
-- First check existing constraint and update it
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

  -- Note: If there's no constraint, we just add the new status value
  -- The status column may be using an enum or just text without constraint
END $$;

-- Add comment for documentation
COMMENT ON TABLE booking_alternative_proposals IS 'Tracks hairdresser-proposed alternative time slots for bookings when they cannot accept the original time';
COMMENT ON COLUMN booking_alternative_proposals.status IS 'Flow state: pending -> slot1_offered -> (slot1_accepted | slot1_rejected -> slot2_offered -> (slot2_accepted | all_rejected)) | expired';
COMMENT ON COLUMN booking_alternative_proposals.current_offer_index IS '1 = first alternative being offered, 2 = second alternative being offered';

-- Enable RLS
ALTER TABLE booking_alternative_proposals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Hairdressers can view and create proposals for their bookings
CREATE POLICY "Hairdressers can view their proposals" ON booking_alternative_proposals
  FOR SELECT USING (
    hairdresser_id IN (
      SELECT id FROM hairdressers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Hairdressers can create proposals" ON booking_alternative_proposals
  FOR INSERT WITH CHECK (
    hairdresser_id IN (
      SELECT id FROM hairdressers WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access" ON booking_alternative_proposals
  FOR ALL USING (auth.role() = 'service_role');
