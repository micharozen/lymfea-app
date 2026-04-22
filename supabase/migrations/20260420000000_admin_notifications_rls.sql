-- Allow admins to read their own notifications
CREATE POLICY "Admins can view their own notifications"
ON "public"."notifications"
FOR SELECT
TO "authenticated"
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
  )
);

-- Allow admins to update their own notifications (mark as read)
CREATE POLICY "Admins can update their own notifications"
ON "public"."notifications"
FOR UPDATE
TO "authenticated"
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
  )
);

-- Allow admins to delete their own notifications
CREATE POLICY "Admins can delete their own notifications"
ON "public"."notifications"
FOR DELETE
TO "authenticated"
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
  )
);
