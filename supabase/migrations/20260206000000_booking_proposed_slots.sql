-- Migration: Add booking_proposed_slots table for multi-slot concierge workflow
-- Enables concierges to propose up to 3 time slots, hairdressers validate one before payment link is sent

CREATE TABLE IF NOT EXISTS booking_proposed_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Slot 1 (required - highest priority / client preferred)
  slot_1_date DATE NOT NULL,
  slot_1_time TIME NOT NULL,

  -- Slot 2 (optional)
  slot_2_date DATE,
  slot_2_time TIME,

  -- Slot 3 (optional)
  slot_3_date DATE,
  slot_3_time TIME,

  -- Validation tracking
  validated_slot INTEGER CHECK (validated_slot IN (1, 2, 3)),
  validated_by UUID REFERENCES hairdressers(id),
  validated_at TIMESTAMPTZ,

  -- Expiration (2h after creation)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  admin_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One record per booking
  CONSTRAINT unique_proposed_slots_per_booking UNIQUE (booking_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposed_slots_booking_id ON booking_proposed_slots(booking_id);
CREATE INDEX IF NOT EXISTS idx_proposed_slots_validated_by ON booking_proposed_slots(validated_by);
CREATE INDEX IF NOT EXISTS idx_proposed_slots_expires_at ON booking_proposed_slots(expires_at)
  WHERE validated_slot IS NULL AND admin_notified_at IS NULL;

-- Enable RLS
ALTER TABLE booking_proposed_slots ENABLE ROW LEVEL SECURITY;

-- Hairdressers can view slots for bookings at their hotels
CREATE POLICY "Hairdressers can view proposed slots" ON booking_proposed_slots
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      INNER JOIN hairdresser_hotels hh ON b.hotel_id = hh.hotel_id
      INNER JOIN hairdressers h ON hh.hairdresser_id = h.id
      WHERE h.user_id = auth.uid()
    )
  );

-- Service role full access (for edge functions)
CREATE POLICY "Service role full access" ON booking_proposed_slots
  FOR ALL USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE booking_proposed_slots IS 'Stores up to 3 proposed time slots for concierge-created bookings. Hairdressers validate one slot before payment link is sent.';
COMMENT ON COLUMN booking_proposed_slots.validated_slot IS 'Which slot (1, 2, or 3) was validated by the hairdresser';
COMMENT ON COLUMN booking_proposed_slots.expires_at IS 'Auto-set to created_at + 2h. If no validation by then, admin is notified.';
