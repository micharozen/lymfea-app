-- Replace 45-minute therapist rate with 75-minute (1h15) bracket

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_75 numeric DEFAULT NULL;

-- Prefill rate_75 by linear interpolation between 1h00 and 1h30
UPDATE therapists
SET rate_75 = ROUND((rate_60 + (rate_90 - rate_60) * 0.5)::numeric, 2)
WHERE rate_60 IS NOT NULL AND rate_90 IS NOT NULL AND rate_75 IS NULL;

ALTER TABLE therapists DROP COLUMN IF EXISTS rate_45;

COMMENT ON COLUMN therapists.rate_75 IS 'Fixed therapist payout for a 75-minute treatment';
