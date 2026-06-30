-- Link a booking treatment line (a "leg") to the therapist who performs it.
-- Only populated for combo-duo bookings, where N treatment lines are split across
-- N therapists. NULL = the line belongs to the booking owner (bookings.therapist_id)
-- or to all accepted therapists (solo / variant-duo). The read paths fall back to
-- showing all lines when no line is assigned to the current therapist.

ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS therapist_id uuid DEFAULT NULL
  REFERENCES therapists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_treatments_therapist_id_idx
  ON booking_treatments (therapist_id);

COMMENT ON COLUMN booking_treatments.therapist_id IS 'Therapist performing this leg in a split (combo-duo). NULL = belongs to the booking owner / all accepted therapists.';
