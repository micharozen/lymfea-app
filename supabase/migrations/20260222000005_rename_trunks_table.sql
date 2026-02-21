-- Migration: Rename trunks → treatment_rooms + columns for Lymfea naming
-- Follows the same pattern as 20260222000002 (hairdresser tables rename).
-- A backward-compat view "trunks" is created so existing code keeps working
-- until all references are updated, then dropped in 20260222000006.

-- ============================================
-- 1. Rename table + columns
-- ============================================
ALTER TABLE trunks RENAME TO treatment_rooms;
ALTER TABLE treatment_rooms RENAME COLUMN trunk_id TO room_number;
ALTER TABLE treatment_rooms RENAME COLUMN trunk_model TO room_type;

-- Drop hairdresser_name (not relevant for treatment rooms)
ALTER TABLE treatment_rooms DROP COLUMN IF EXISTS hairdresser_name;

-- Add capacity column (1 = individual, 2 = couple, etc.)
ALTER TABLE treatment_rooms ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 1;

-- Rename legacy PK constraint
ALTER INDEX IF EXISTS boxes_pkey RENAME TO treatment_rooms_pkey;

-- ============================================
-- 2. Rename trunk_id column on bookings
-- ============================================
ALTER TABLE bookings RENAME COLUMN trunk_id TO room_id;
ALTER INDEX IF EXISTS idx_bookings_trunk_id RENAME TO idx_bookings_room_id;

-- ============================================
-- 3. Rename RLS policies (legacy "boxes" names)
-- ============================================
ALTER POLICY "Admins can create boxes" ON treatment_rooms
  RENAME TO "Admins can create treatment rooms";

ALTER POLICY "Admins can delete boxes" ON treatment_rooms
  RENAME TO "Admins can delete treatment rooms";

ALTER POLICY "Admins can update boxes" ON treatment_rooms
  RENAME TO "Admins can update treatment rooms";

ALTER POLICY "Admins can view all boxes" ON treatment_rooms
  RENAME TO "Admins can view all treatment rooms";

ALTER POLICY "Concierges can view boxes from their hotels" ON treatment_rooms
  RENAME TO "Concierges can view treatment rooms from their hotels";

ALTER POLICY "Concierges can view boxes from their hotels (read-only)" ON treatment_rooms
  RENAME TO "Concierges can view treatment rooms from their hotels (read-only)";

-- ============================================
-- 4. Backward-compat view (temporary)
-- ============================================
CREATE VIEW trunks AS
  SELECT id, name,
         room_number AS trunk_id,
         room_type AS trunk_model,
         NULL::text AS hairdresser_name,
         image, hotel_id, hotel_name,
         next_booking, status, capacity,
         created_at, updated_at
  FROM treatment_rooms;

GRANT ALL ON trunks TO anon, authenticated, service_role;
