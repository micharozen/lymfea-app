-- RPC function to calculate the time gap until the next booking in the same room
CREATE OR REPLACE FUNCTION get_room_next_booking_gap(
  _room_id UUID,
  _booking_date DATE,
  _booking_end_time TIME,
  _current_booking_id UUID
)
RETURNS TABLE(next_booking_time TIME, gap_minutes INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.booking_time::TIME AS next_booking_time,
    EXTRACT(EPOCH FROM (b.booking_time::TIME - _booking_end_time))::INT / 60 AS gap_minutes
  FROM bookings b
  WHERE b.room_id = _room_id
    AND b.booking_date = _booking_date
    AND b.booking_time::TIME > _booking_end_time
    AND b.id != _current_booking_id
    AND b.status NOT IN ('cancelled', 'noshow')
  ORDER BY b.booking_time::TIME ASC
  LIMIT 1;
END;
$$;
