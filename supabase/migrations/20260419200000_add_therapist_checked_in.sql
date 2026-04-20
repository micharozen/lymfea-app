-- Add therapist check-in timestamp to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS therapist_checked_in_at TIMESTAMPTZ DEFAULT NULL;
