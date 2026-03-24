-- Add capabilities column (array of treatment types the room supports)
ALTER TABLE treatment_rooms
  ADD COLUMN IF NOT EXISTS capabilities text[] DEFAULT '{}';

-- Migrate existing room_type data to capabilities array
UPDATE treatment_rooms
  SET capabilities = ARRAY[room_type]
  WHERE room_type IS NOT NULL
    AND (capabilities IS NULL OR capabilities = '{}');

-- Add index for capability-based lookups (e.g., find rooms that support "Massage")
CREATE INDEX IF NOT EXISTS idx_treatment_rooms_capabilities
  ON treatment_rooms USING GIN (capabilities);

-- RLS: update existing policies to include the new column (no changes needed,
-- existing policies already cover all columns on the table)

COMMENT ON COLUMN treatment_rooms.capabilities IS
  'Array of treatment types this room supports (e.g. Massage, Facial, Hammam). Replaces the single room_type field.';
