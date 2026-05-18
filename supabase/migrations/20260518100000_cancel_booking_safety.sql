-- Atomic cancellation helper used by the cancel-booking Edge Function.
-- Restricted to service_role: clients must go through the Edge Function auth/policy checks.
CREATE OR REPLACE FUNCTION public.begin_booking_cancellation(
  _booking_id UUID,
  _reason TEXT,
  _cancelled_by UUID,
  _cancellation_fee_amount NUMERIC,
  _refund_amount NUMERIC
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_status TEXT;
BEGIN
  SELECT status
  INTO _current_status
  FROM public.bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _current_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    cancelled_at = NOW(),
    cancelled_by = _cancelled_by,
    cancellation_fee_amount = COALESCE(_cancellation_fee_amount, 0),
    refund_amount = COALESCE(_refund_amount, 0)
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) TO service_role;

CREATE INDEX IF NOT EXISTS idx_booking_treatments_booking_id
ON public.booking_treatments(booking_id);
