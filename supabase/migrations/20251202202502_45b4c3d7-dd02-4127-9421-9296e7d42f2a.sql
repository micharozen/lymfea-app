-- Create a security definer function to handle unassigning a booking
CREATE OR REPLACE FUNCTION public.unassign_booking(_booking_id uuid, _hairdresser_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
  _current_declined_by uuid[];
BEGIN
  -- Lock the row for update and verify ownership
  SELECT hairdresser_id, COALESCE(declined_by, ARRAY[]::uuid[]) 
  INTO _current_hairdresser_id, _current_declined_by
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  -- Only allow if hairdresser_id matches the current hairdresser
  IF _current_hairdresser_id IS NULL OR _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_assigned_to_you');
  END IF;

  -- Update the booking
  UPDATE bookings
  SET 
    hairdresser_id = NULL,
    hairdresser_name = NULL,
    status = 'En attente',
    assigned_at = NULL,
    declined_by = array_append(_current_declined_by, _hairdresser_id),
    updated_at = now()
  WHERE id = _booking_id
  RETURNING jsonb_build_object(
    'id', id,
    'booking_id', booking_id,
    'status', status
  ) INTO _result;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;