-- Duo bookings: the PWA planning must show every accepted therapist of a
-- booking, but the therapists RLS only lets a therapist read their own
-- profile. This SECURITY DEFINER RPC exposes just id + names, and only to
-- callers who participate in the booking (primary therapist or roster
-- member) or manage its venue as concierge.
CREATE OR REPLACE FUNCTION public.get_booking_therapist_names(_booking_ids uuid[])
RETURNS TABLE (booking_id uuid, therapist_id uuid, first_name text, last_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bt.booking_id, t.id, t.first_name, t.last_name
  FROM booking_therapists bt
  JOIN therapists t ON t.id = bt.therapist_id
  WHERE bt.booking_id = ANY(_booking_ids)
    AND bt.status = 'accepted'
    AND (
      EXISTS (
        SELECT 1
        FROM therapists me
        WHERE me.user_id = auth.uid()
          AND (
            EXISTS (
              SELECT 1 FROM booking_therapists mine
              WHERE mine.booking_id = bt.booking_id
                AND mine.therapist_id = me.id
            )
            OR EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.id = bt.booking_id
                AND b.therapist_id = me.id
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM bookings b
        JOIN concierge_hotels ch ON ch.hotel_id = b.hotel_id
        JOIN concierges c ON c.id = ch.concierge_id
        WHERE b.id = bt.booking_id
          AND c.user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_booking_therapist_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_therapist_names(uuid[]) TO authenticated, service_role;
