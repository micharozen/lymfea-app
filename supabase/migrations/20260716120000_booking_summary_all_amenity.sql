-- Expose `all_amenity` on get_booking_summary so the client confirmation page
-- can switch to neutral "réservation" wording for an amenity-only cart
-- (pool/sauna access — no hands-on soin, no praticien). True only when the
-- booking has at least one treatment and every treatment is an amenity.

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
    'hotels', (
      SELECT json_build_object(
        'name', h.name,
        'organization_name', o.name,
        'website_url', h.website_url,
        'address', h.address,
        'postal_code', h.postal_code,
        'city', h.city,
        'country', h.country,
        'contact_email', h.contact_email
      )
      FROM public.hotels h
      LEFT JOIN public.organizations o ON o.id = h.organization_id
      WHERE h.id = b.hotel_id
    ),
    'treatments', COALESCE(
      (
        SELECT json_agg(tm.name)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      '[]'::json
    ),
    'all_amenity', COALESCE(
      (
        SELECT count(*) > 0 AND bool_and(tm.amenity_id IS NOT NULL)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      false
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
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO service_role;
