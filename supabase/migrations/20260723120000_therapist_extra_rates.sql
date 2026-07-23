-- Add extra therapist duration rate brackets: 45, 105, 120, 150 minutes.
-- The base brackets (60/75/90) remain mandatory in the UI; these are optional
-- and configured on demand via the "Add a rate" action in the therapist form.

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_45  numeric DEFAULT NULL;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_105 numeric DEFAULT NULL;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_120 numeric DEFAULT NULL;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_150 numeric DEFAULT NULL;

COMMENT ON COLUMN therapists.rate_45  IS 'Fixed therapist payout for a 45-minute treatment';
COMMENT ON COLUMN therapists.rate_105 IS 'Fixed therapist payout for a 105-minute treatment';
COMMENT ON COLUMN therapists.rate_120 IS 'Fixed therapist payout for a 120-minute treatment';
COMMENT ON COLUMN therapists.rate_150 IS 'Fixed therapist payout for a 150-minute treatment';
