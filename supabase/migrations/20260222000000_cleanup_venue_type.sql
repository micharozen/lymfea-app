-- Migration: Clean up venue_type constraint for Lymfea
-- Remove 'coworking' and 'enterprise' venue types (OOM legacy), keep 'hotel', add 'spa'
-- Lymfea only supports: hotel (spa within a hotel) and spa (independent day spa)

-- Step 1: Migrate existing data — any coworking/enterprise venues become hotel
UPDATE hotels SET venue_type = 'hotel' WHERE venue_type IN ('coworking', 'enterprise');

-- Step 2: Replace the CHECK constraint
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_venue_type_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_venue_type_check
  CHECK (venue_type IN ('hotel', 'spa'));
