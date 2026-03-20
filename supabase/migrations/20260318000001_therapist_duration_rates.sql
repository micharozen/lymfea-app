-- Add per-duration fixed rates for therapists (45min, 1h, 1h30)
-- Replaces the single hourly_rate with granular pricing per standard duration

ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS rate_45 numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rate_60 numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rate_90 numeric DEFAULT NULL;

COMMENT ON COLUMN therapists.rate_45 IS 'Fixed therapist payout for a 45-minute treatment';
COMMENT ON COLUMN therapists.rate_60 IS 'Fixed therapist payout for a 60-minute treatment';
COMMENT ON COLUMN therapists.rate_90 IS 'Fixed therapist payout for a 90-minute treatment';
