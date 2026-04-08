-- Add minimum_guarantee_active boolean to therapists.
-- Controls whether the minimum guarantee feature is enabled for this therapist.

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS minimum_guarantee_active BOOLEAN DEFAULT false;
