-- Final public manage-booking read model used by ManageBooking and CancelBookingDialog.
-- Exposes only the fields needed by the public client page, including payment preview/status.

DROP FUNCTION IF EXISTS public.get_public_booking(text);

CREATE FUNCTION public.get_public_booking(p_token text)
RETURNS TABLE (
  id uuid,
  booking_id bigint,
  booking_date date,
  booking_time text,
  client_first_name text,
  client_last_name text,
  phone text,
  client_email text,
  hotel_id text,
  hotel_name text,
  room_number text,
  total_price numeric,
  status text,
  language text,
  short_token text,
  payment_method text,
  payment_status text,
  card_brand text,
  card_last4 text,
  estimated_price numeric,
  booking_treatments jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    b.id,
    b.booking_id,
    b.booking_date,
    b.booking_time,
    b.client_first_name,
    b.client_last_name,
    b.phone,
    b.client_email,
    b.hotel_id::text,
    b.hotel_name,
    b.room_number,
    b.total_price,
    b.status,
    b.language,
    b.short_token,
    b.payment_method,
    b.payment_status,
    bpi.card_brand,
    bpi.card_last4,
    bpi.estimated_price,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'treatment_id', bt.treatment_id,
          'treatment', jsonb_build_object(
            'id', tm.id,
            'name', tm.name,
            'duration', tm.duration,
            'price', tm.price
          )
        )
      ) FILTER (WHERE bt.id IS NOT NULL),
      '[]'::jsonb
    ) AS booking_treatments
  FROM public.bookings b
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  LEFT JOIN public.booking_treatments bt ON bt.booking_id = b.id
  LEFT JOIN public.treatment_menus tm ON tm.id = bt.treatment_id
  WHERE (p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND b.id = p_token::uuid)
     OR b.short_token = p_token
  GROUP BY b.id, b.payment_status, bpi.card_brand, bpi.card_last4, bpi.estimated_price;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_booking(text) TO anon, authenticated;
