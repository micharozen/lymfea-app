CREATE OR REPLACE FUNCTION get_booking_by_signature_token(p_token TEXT)
RETURNS TABLE (
  id uuid,
  client_first_name text,
  client_last_name text,
  booking_date date,
  booking_time time,
  room_number text,
  client_signature text,
  signed_at timestamptz,
  hotel_id text,
  hotel_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id, b.client_first_name, b.client_last_name, b.booking_date, b.booking_time,
    b.room_number, b.client_signature, b.signed_at, b.hotel_id, b.hotel_name
  FROM public.bookings b
  WHERE b.signature_token = p_token
    AND b.status IN ('pending', 'confirmed', 'ongoing');
END;
$$;

GRANT EXECUTE ON FUNCTION get_booking_by_signature_token(TEXT) TO anon;