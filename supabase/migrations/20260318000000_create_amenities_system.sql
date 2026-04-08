-- ============================================================
-- Amenities System: venue_amenities + amenity_bookings
-- Allows venues to configure amenities (pool, fitness, etc.)
-- with capacity-based booking separate from treatment bookings.
-- ============================================================

-- ============================================
-- 1. venue_amenities — per-venue amenity configuration
-- Amenity types are defined frontend-side (AMENITY_TYPES constant).
-- ============================================
CREATE TABLE venue_amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                   -- 'pool', 'fitness', 'sauna', 'hammam', 'jacuzzi'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  name TEXT,                            -- custom display name (null = use frontend default)
  color TEXT NOT NULL DEFAULT '#3b82f6',
  capacity_per_slot INTEGER NOT NULL DEFAULT 10,
  slot_duration INTEGER NOT NULL DEFAULT 60,       -- minutes
  prep_time INTEGER NOT NULL DEFAULT 0,            -- minutes between bookings (privatized amenities)
  -- Pricing
  price_external NUMERIC(10,2) DEFAULT 0,          -- price for external clients
  price_lymfea NUMERIC(10,2) DEFAULT 0,            -- price for lymfea clients (when not included)
  lymfea_access_included BOOLEAN NOT NULL DEFAULT true, -- free access for lymfea (treatment) clients
  lymfea_access_duration INTEGER DEFAULT 60,        -- complimentary access duration (minutes)
  currency TEXT DEFAULT 'EUR',
  -- Venue-specific hours (null = follows venue hours)
  opening_time TIME,
  closing_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, type)
);

COMMENT ON TABLE venue_amenities IS 'Per-venue amenity configuration (pool, fitness, sauna, etc.)';
COMMENT ON COLUMN venue_amenities.type IS 'Amenity type key matching frontend AMENITY_TYPES constant';
COMMENT ON COLUMN venue_amenities.prep_time IS 'Cleaning/prep time in minutes between bookings for privatized amenities';
COMMENT ON COLUMN venue_amenities.lymfea_access_included IS 'Whether spa treatment clients get free amenity access';
COMMENT ON COLUMN venue_amenities.lymfea_access_duration IS 'Duration in minutes of complimentary access for treatment clients';

CREATE INDEX idx_venue_amenities_hotel ON venue_amenities(hotel_id);

ALTER TABLE venue_amenities ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_venue_amenities_updated_at
  BEFORE UPDATE ON venue_amenities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: same pattern as bookings
CREATE POLICY "Admins can manage venue amenities" ON venue_amenities
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view venue amenities for their hotels" ON venue_amenities
  FOR SELECT USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Concierges can manage venue amenities for their hotels" ON venue_amenities
  FOR ALL USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  ) WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Block anonymous access to venue amenities" ON venue_amenities
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON venue_amenities TO anon, authenticated, service_role;

-- ============================================
-- 2. amenity_bookings — capacity-based amenity reservations
-- Uses customer_id FK to customers table (via find_or_create_customer RPC).
-- ============================================
CREATE TABLE amenity_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  venue_amenity_id UUID NOT NULL REFERENCES venue_amenities(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  duration INTEGER NOT NULL,           -- minutes
  end_time TIME NOT NULL,              -- booking_time + duration (for overlap queries)
  -- Client (references customers table)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('external', 'internal', 'lymfea')),
  room_number TEXT,                    -- hotel room for internal clients
  linked_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL, -- link to treatment booking for lymfea clients
  num_guests INTEGER NOT NULL DEFAULT 1,
  -- Payment
  price NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  -- Status
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'noshow')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE amenity_bookings IS 'Capacity-based amenity reservations (pool, fitness, etc.)';
COMMENT ON COLUMN amenity_bookings.client_type IS 'external = paying guest, internal = hotel guest (free), lymfea = treatment client';
COMMENT ON COLUMN amenity_bookings.linked_booking_id IS 'For lymfea clients: reference to the treatment booking that includes amenity access';
COMMENT ON COLUMN amenity_bookings.end_time IS 'Pre-computed end time for efficient overlap queries';

CREATE INDEX idx_amenity_bookings_venue_date ON amenity_bookings(hotel_id, booking_date);
CREATE INDEX idx_amenity_bookings_amenity_date ON amenity_bookings(venue_amenity_id, booking_date);
CREATE INDEX idx_amenity_bookings_customer ON amenity_bookings(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE amenity_bookings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_amenity_bookings_updated_at
  BEFORE UPDATE ON amenity_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: mirror bookings table policies
CREATE POLICY "Admins can manage amenity bookings" ON amenity_bookings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view amenity bookings for their hotels" ON amenity_bookings
  FOR SELECT USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Concierges can create amenity bookings for their hotels" ON amenity_bookings
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Concierges can update amenity bookings for their hotels" ON amenity_bookings
  FOR UPDATE USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  ) WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Concierges can delete amenity bookings for their hotels" ON amenity_bookings
  FOR DELETE USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM get_concierge_hotels(auth.uid()))
  );

CREATE POLICY "Block anonymous access to amenity bookings" ON amenity_bookings
  AS RESTRICTIVE TO anon USING (false);

GRANT ALL ON amenity_bookings TO anon, authenticated, service_role;

-- ============================================
-- 3. RPC: get_amenity_slot_occupancy
-- Returns total guests booked for a given amenity/date/time range.
-- Used for capacity checks before creating bookings.
-- ============================================
CREATE OR REPLACE FUNCTION get_amenity_slot_occupancy(
  p_venue_amenity_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(num_guests), 0)::INTEGER
  FROM amenity_bookings
  WHERE venue_amenity_id = p_venue_amenity_id
    AND booking_date = p_date
    AND status NOT IN ('cancelled')
    AND booking_time < p_end_time
    AND end_time > p_start_time;
$$;

COMMENT ON FUNCTION get_amenity_slot_occupancy IS 'Returns total guests booked for a given amenity slot (for capacity checking)';

-- ============================================
-- 4. Enable Realtime for amenity_bookings
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE amenity_bookings;
