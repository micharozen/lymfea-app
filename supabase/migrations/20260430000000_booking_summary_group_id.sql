-- Expose booking_group_id, client_first_name, and group_siblings on get_booking_summary.
-- booking_group_id was added in 20260429140000 but the function predates it.
-- client_first_name is needed for the "Merci, <Prénom>" heading on the confirmation page.
-- group_siblings is included here (SECURITY DEFINER) because the client cannot query bookings
-- directly via RLS — this is the only safe path to fetch sibling slots.

CREATE OR REPLACE FUNCTION public.get_booking_summary(_booking_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', b.id,
    'booking_date', b.booking_date,
    'booking_time', b.booking_time,
    'room_number', b.room_number,
    'status', b.status,
    'payment_method', b.payment_method,
    'payment_status', b.payment_status,
    'payment_link_language', b.payment_link_language,
    'booking_group_id', b.booking_group_id,
    'client_first_name', b.client_first_name,
    'hotels', (SELECT json_build_object('name', name) FROM hotels WHERE id = b.hotel_id),
    'treatments', COALESCE(
      (
        SELECT json_agg(tm.name)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      '[]'::json
    ),
    'group_siblings', CASE
      WHEN b.booking_group_id IS NOT NULL THEN (
        SELECT json_agg(
          json_build_object(
            'id', s.id,
            'booking_date', s.booking_date,
            'booking_time', s.booking_time,
            'treatment_name', COALESCE(
              (
                SELECT string_agg(tm.name, ', ' ORDER BY tm.name)
                FROM booking_treatments bt
                JOIN treatment_menus tm ON tm.id = bt.treatment_id
                WHERE bt.booking_id = s.id
              ),
              '—'
            )
          )
          ORDER BY s.booking_date, s.booking_time
        )
        FROM bookings s
        WHERE s.booking_group_id = b.booking_group_id
      )
      ELSE NULL
    END
  )
  FROM bookings b
  WHERE b.id = _booking_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO authenticated;
