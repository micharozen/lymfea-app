-- Fix accept_booking: Add authorization check to verify caller owns the hairdresser record
CREATE OR REPLACE FUNCTION public.accept_booking(_booking_id uuid, _hairdresser_id uuid, _hairdresser_name text, _total_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
BEGIN
  -- SECURITY: Verify caller owns the hairdresser record
  IF NOT EXISTS (
    SELECT 1 FROM hairdressers 
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT hairdresser_id INTO _current_hairdresser_id
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NOT NULL AND _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_taken');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = _hairdresser_id,
    hairdresser_name = _hairdresser_name,
    status = 'confirmed',
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
$function$;

-- Fix unassign_booking: Add authorization check to verify caller owns the hairdresser record
CREATE OR REPLACE FUNCTION public.unassign_booking(_booking_id uuid, _hairdresser_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _current_hairdresser_id uuid;
  _current_declined_by uuid[];
BEGIN
  -- SECURITY: Verify caller owns the hairdresser record
  IF NOT EXISTS (
    SELECT 1 FROM hairdressers 
    WHERE id = _hairdresser_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT hairdresser_id, COALESCE(declined_by, ARRAY[]::uuid[]) 
  INTO _current_hairdresser_id, _current_declined_by
  FROM bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF _current_hairdresser_id IS NULL OR _current_hairdresser_id != _hairdresser_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_assigned_to_you');
  END IF;

  UPDATE bookings
  SET 
    hairdresser_id = NULL,
    hairdresser_name = NULL,
    status = 'pending',
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
$function$;