-- Migration: Create venue_blocked_slots table
-- Allows venue admins to define recurring blocked time ranges (e.g., lunch breaks)
-- where bookings are not permitted. These ranges are filtered out in check-availability.

CREATE TABLE IF NOT EXISTS venue_blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocked_slot_time_order CHECK (start_time < end_time)
);

-- Index for active blocked slots lookup by hotel
CREATE INDEX idx_blocked_slots_hotel_active ON venue_blocked_slots(hotel_id) WHERE is_active = true;

-- Enable RLS
ALTER TABLE venue_blocked_slots ENABLE ROW LEVEL SECURITY;

-- Admins: full CRUD
CREATE POLICY "Admins can manage venue blocked slots" ON venue_blocked_slots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role full access (for edge functions like check-availability)
CREATE POLICY "Service role full access on venue blocked slots" ON venue_blocked_slots
  FOR ALL USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE venue_blocked_slots IS 'Defines time ranges when a venue cannot accept bookings (e.g., lunch breaks). Slots falling within these ranges are filtered out of check-availability results.';
COMMENT ON COLUMN venue_blocked_slots.days_of_week IS 'Days when this block applies. NULL means all days. Uses PostgreSQL DOW convention: 0=Sunday, 1=Monday, ..., 6=Saturday.';
COMMENT ON COLUMN venue_blocked_slots.label IS 'Human-readable label for the block, shown in admin UI (e.g., "Pause déjeuner").';
