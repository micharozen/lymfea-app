-- Fonction pour accepter une réservation de manière atomique
CREATE OR REPLACE FUNCTION public.accept_booking(
  _booking_id uuid,
  _hairdresser_id uuid,
  _hairdresser_name text,
  _total_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
BEGIN
  -- Lock the row for update
  SELECT hairdresser_id INTO _current_hairdresser_id
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  -- Check if booking can be accepted
  IF _current_hairdresser_id IS NOT NULL AND _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  -- Update the booking
  UPDATE bookings
  SET 
    hairdresser_id = _hairdresser_id,
    hairdresser_name = _hairdresser_name,
    status = 'Assigné',
    assigned_at = now(),
    total_price = _total_price,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'hairdresser_id', hairdresser_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;