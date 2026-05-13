-- Public booking access via SECURITY DEFINER functions.
--
-- The bookings table has a RESTRICTIVE RLS policy blocking all anonymous reads.
-- ManageBooking (/m/:token and /booking/manage/:uuid) is a public page that must
-- work without authentication. Rather than removing the restrictive policy (risk
-- of exposing the full table), we expose three narrow SECURITY DEFINER functions
-- that bypass RLS for specific, controlled operations only.
--
-- Pattern matches existing get_public_hotel_by_id() in the codebase.

-- ── READ ──────────────────────────────────────────────────────────────────────
-- Returns the full booking row + booking_treatments for a given UUID or short_token.
-- Used by ManageBooking to display the booking details page.

CREATE OR REPLACE FUNCTION public.get_public_booking(p_token text)
RETURNS TABLE (
  id uuid,
  booking_id bigint,
  booking_date date,
  booking_time text,
  client_first_name text,
  client_last_name text,
  phone text,
  client_email text,
  hotel_id uuid,
  hotel_name text,
  room_number text,
  total_price numeric,
  status text,
  language text,
  short_token text,
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
    b.hotel_id,
    b.hotel_name,
    b.room_number,
    b.total_price,
    b.status,
    b.language,
    b.short_token,
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
  LEFT JOIN public.booking_treatments bt ON bt.booking_id = b.id
  LEFT JOIN public.treatment_menus tm ON tm.id = bt.treatment_id
  WHERE b.id::text = p_token
     OR b.short_token = p_token
  GROUP BY b.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_booking(text) TO anon, authenticated;

-- ── CANCEL ────────────────────────────────────────────────────────────────────
-- Allows a client to cancel their own booking via the public manage link.
-- Guards: booking must not already be cancelled or completed.

CREATE OR REPLACE FUNCTION public.cancel_booking_public(p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancellation_reason = 'Annulation client (Web)',
    updated_at = now()
  WHERE (id::text = p_token OR short_token = p_token)
    AND status NOT IN ('cancelled', 'completed');
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking_public(text) TO anon, authenticated;

-- ── RESCHEDULE ────────────────────────────────────────────────────────────────
-- Allows a client to reschedule their own booking via the public manage link.
-- Guards: booking must not be cancelled or completed.

CREATE OR REPLACE FUNCTION public.reschedule_booking_public(
  p_token text,
  p_new_date text,
  p_new_time text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET
    booking_date = p_new_date::date,
    booking_time = p_new_time,
    updated_at = now()
  WHERE (id::text = p_token OR short_token = p_token)
    AND status NOT IN ('cancelled', 'completed');
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_public(text, text, text) TO anon, authenticated;
