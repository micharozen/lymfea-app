-- Add minimum_guarantee JSONB column to therapists.
-- Stores per-day-of-week minimum booking targets for dispatch algorithm.
-- Keys: "0" (Sun) through "6" (Sat), values: min bookings count.
-- Empty object = no guarantee.

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS minimum_guarantee JSONB DEFAULT '{}';
