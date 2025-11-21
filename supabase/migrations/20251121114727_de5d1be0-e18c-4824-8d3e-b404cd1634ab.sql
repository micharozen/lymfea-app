-- Correction de la fonction pour gérer les réservations "En attente" avec hairdresser_id
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
  _current_status text;
BEGIN
  -- Lock the row for update and get current state
  SELECT hairdresser_id, status INTO _current_hairdresser_id, _current_status
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  -- Check if booking can be accepted:
  -- 1. If no hairdresser assigned yet (NULL) -> OK
  -- 2. If same hairdresser -> OK (re-accept own booking)
  -- 3. If different hairdresser and status is "En attente" -> REJECT
  -- 4. If different hairdresser and status is not "En attente" -> OK (can steal if pending)
  IF _current_hairdresser_id IS NOT NULL 
     AND _current_hairdresser_id != _hairdresser_id 
     AND _current_status != 'En attente' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  -- Update the booking with status "Confirmé"
  UPDATE bookings
  SET 
    hairdresser_id = _hairdresser_id,
    hairdresser_name = _hairdresser_name,
    status = 'Confirmé',
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