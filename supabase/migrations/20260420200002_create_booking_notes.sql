-- Internal notes thread on bookings (admin/concierge only)
CREATE TABLE booking_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_notes_booking ON booking_notes(booking_id, created_at ASC);

ALTER TABLE booking_notes ENABLE ROW LEVEL SECURITY;

-- Staff can read all notes
CREATE POLICY "staff_read_booking_notes" ON booking_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'concierge')
    )
  );

-- Staff can insert their own notes
CREATE POLICY "staff_insert_booking_notes" ON booking_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'concierge')
    )
  );

-- Staff can delete their own notes
CREATE POLICY "staff_delete_own_booking_notes" ON booking_notes
  FOR DELETE USING (
    user_id = auth.uid()
  );
