-- No-show: atomic DB update + payment audit on booking_payment_infos.
-- Must be invoked by a service_role Edge Function (PWA incident reporting).

CREATE OR REPLACE FUNCTION public.begin_booking_noshow(
  _booking_id UUID,
  _reason TEXT,
  _changed_by UUID,
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
  _gift_restored_cents INTEGER := 0;
BEGIN
  SELECT status
  INTO _current_status
  FROM public.bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _current_status IN ('cancelled', 'completed', 'noshow') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

  -- Mirror cancellation behavior: restore any consumed bundle usages
  -- so no-show does not permanently consume credits.
  WITH usage_totals AS (
    SELECT
      customer_bundle_id,
      SUM(amount_cents_used)::INTEGER AS amount_cents
    FROM public.bundle_amount_usages
    WHERE booking_id = _booking_id
    GROUP BY customer_bundle_id
  ),
  restored_bundles AS (
    UPDATE public.customer_treatment_bundles ctb
    SET
      used_amount_cents = GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents),
      status = CASE
        WHEN ctb.status = 'completed'
          AND ctb.total_amount_cents IS NOT NULL
          AND GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents) < ctb.total_amount_cents
          AND ctb.expires_at >= CURRENT_DATE
        THEN 'active'
        ELSE ctb.status
      END,
      updated_at = NOW()
    FROM usage_totals
    WHERE ctb.id = usage_totals.customer_bundle_id
    RETURNING usage_totals.amount_cents
  )
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  INTO _gift_restored_cents
  FROM restored_bundles;

  DELETE FROM public.bundle_amount_usages
  WHERE booking_id = _booking_id;

  -- Upsert payment audit on booking_payment_infos.
  INSERT INTO public.booking_payment_infos (
    booking_id,
    customer_id,
    estimated_price,
    cancelled_at,
    cancelled_by,
    cancellation_fee_amount,
    refund_amount,
    updated_at
  )
  SELECT
    b.id,
    COALESCE(bpi.customer_id, b.customer_id),
    COALESCE(bpi.estimated_price, b.total_price),
    NOW(),
    _changed_by,
    COALESCE(_cancellation_fee_amount, 0),
    COALESCE(_refund_amount, 0),
    NOW()
  FROM public.bookings b
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  WHERE b.id = _booking_id
  ON CONFLICT (booking_id) DO UPDATE SET
    cancelled_at = EXCLUDED.cancelled_at,
    cancelled_by = EXCLUDED.cancelled_by,
    cancellation_fee_amount = EXCLUDED.cancellation_fee_amount,
    refund_amount = EXCLUDED.refund_amount,
    estimated_price = COALESCE(booking_payment_infos.estimated_price, EXCLUDED.estimated_price),
    customer_id = COALESCE(booking_payment_infos.customer_id, EXCLUDED.customer_id),
    updated_at = NOW();

  RETURN QUERY
  UPDATE public.bookings
  SET
    status = 'noshow',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    gift_amount_applied_cents = GREATEST(0, gift_amount_applied_cents - _gift_restored_cents)
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_booking_noshow(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_booking_noshow(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.begin_booking_noshow(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_booking_noshow(UUID, TEXT, UUID, NUMERIC, NUMERIC) TO service_role;

