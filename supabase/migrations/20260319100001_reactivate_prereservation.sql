-- Reactivate a cancelled pre-reservation if the slot is still available
-- Used when client pays after the 4-min TTL but the slot wasn't taken by someone else

CREATE OR REPLACE FUNCTION reactivate_prereservation(
  _booking_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking RECORD;
  _new_start INTEGER;
  _new_end INTEGER;
  _has_conflict BOOLEAN;
BEGIN
  -- Fetch the cancelled booking
  SELECT * INTO _booking FROM bookings WHERE id = _booking_id;

  IF _booking IS NULL OR _booking.status NOT IN ('cancelled', 'Annulé') THEN
    RETURN false;
  END IF;

  -- Lock active bookings for this hotel+date (exclude self)
  PERFORM id FROM bookings
  WHERE hotel_id = _booking.hotel_id
    AND booking_date = _booking.booking_date
    AND id != _booking_id
    AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
    AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
  FOR UPDATE;

  _new_start := EXTRACT(HOUR FROM _booking.booking_time) * 60 + EXTRACT(MINUTE FROM _booking.booking_time);
  _new_end := _new_start + COALESCE(_booking.duration, 30);

  -- Check room time conflict
  SELECT EXISTS(
    SELECT 1 FROM bookings
    WHERE hotel_id = _booking.hotel_id
      AND booking_date = _booking.booking_date
      AND room_id = _booking.room_id
      AND id != _booking_id
      AND status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
      AND NOT (payment_status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '4 minutes')
      AND (
        _new_start < (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time)) + COALESCE(duration, 30)
        AND _new_end > (EXTRACT(HOUR FROM booking_time) * 60 + EXTRACT(MINUTE FROM booking_time))
      )
  ) INTO _has_conflict;

  IF _has_conflict THEN
    RETURN false;
  END IF;

  -- Reactivate the booking
  UPDATE bookings
  SET status = 'pending',
      payment_status = 'paid',
      cancellation_reason = NULL
  WHERE id = _booking_id;

  RETURN true;
END;
$$;
