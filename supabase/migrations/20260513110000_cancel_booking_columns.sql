-- Cancellation flow: audit columns, venue policy, atomic DB helpers.
-- Clients and staff must go through the cancel-booking Edge Function; RPCs are service_role only.

-- Cancellation audit columns on bookings (cancellation_reason TEXT already exists).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by            UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id        TEXT;

-- Cancellation policy per venue.
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_type   TEXT DEFAULT 'none'
    CHECK (cancellation_fee_type IN ('none', 'fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS cancellation_policy_text_fr TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy_text_en TEXT;

-- Remove legacy public RPC that cancelled in DB without Stripe settlement.
DROP FUNCTION IF EXISTS public.cancel_booking_public(text);

CREATE INDEX IF NOT EXISTS idx_booking_treatments_booking_id
ON public.booking_treatments(booking_id);

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

  IF _current_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

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

  RETURN QUERY
  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    cancelled_at = NOW(),
    cancelled_by = _cancelled_by,
    cancellation_fee_amount = COALESCE(_cancellation_fee_amount, 0),
    refund_amount = COALESCE(_refund_amount, 0),
    gift_amount_applied_cents = GREATEST(0, gift_amount_applied_cents - _gift_restored_cents)
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_booking_cancellation(UUID, TEXT, UUID, NUMERIC, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.revert_booking_cancellation_after_stripe_error(
  _booking_id UUID,
  _status TEXT,
  _reason TEXT,
  _cancelled_at TIMESTAMPTZ,
  _cancelled_by UUID,
  _cancellation_fee_amount NUMERIC,
  _refund_amount NUMERIC,
  _stripe_refund_id TEXT,
  _gift_amount_applied_cents INTEGER,
  _gift_amount_usages JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.bookings
  SET
    status = _status,
    cancellation_reason = _reason,
    cancelled_at = _cancelled_at,
    cancelled_by = _cancelled_by,
    cancellation_fee_amount = COALESCE(_cancellation_fee_amount, 0),
    refund_amount = COALESCE(_refund_amount, 0),
    stripe_refund_id = _stripe_refund_id,
    gift_amount_applied_cents = COALESCE(_gift_amount_applied_cents, 0)
  WHERE id = _booking_id;

  WITH input_rows AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(_gift_amount_usages, '[]'::JSONB)) AS usage(
      id UUID,
      customer_bundle_id UUID,
      amount_cents_used INTEGER,
      used_at TIMESTAMPTZ
    )
  ),
  inserted_usages AS (
    INSERT INTO public.bundle_amount_usages (
      id,
      booking_id,
      customer_bundle_id,
      amount_cents_used,
      used_at
    )
    SELECT
      id,
      _booking_id,
      customer_bundle_id,
      amount_cents_used,
      used_at
    FROM input_rows
    WHERE amount_cents_used > 0
    ON CONFLICT (id) DO NOTHING
    RETURNING customer_bundle_id, amount_cents_used
  ),
  usage_totals AS (
    SELECT
      customer_bundle_id,
      SUM(amount_cents_used)::INTEGER AS amount_cents
    FROM inserted_usages
    GROUP BY customer_bundle_id
  )
  UPDATE public.customer_treatment_bundles ctb
  SET
    used_amount_cents = ctb.used_amount_cents + usage_totals.amount_cents,
    status = CASE
      WHEN ctb.total_amount_cents IS NOT NULL
        AND ctb.used_amount_cents + usage_totals.amount_cents >= ctb.total_amount_cents
      THEN 'completed'
      ELSE ctb.status
    END,
    updated_at = NOW()
  FROM usage_totals
  WHERE ctb.id = usage_totals.customer_bundle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_booking_cancellation_after_stripe_error(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, NUMERIC, NUMERIC, TEXT, INTEGER, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_booking_cancellation_after_stripe_error(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, NUMERIC, NUMERIC, TEXT, INTEGER, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.revert_booking_cancellation_after_stripe_error(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, NUMERIC, NUMERIC, TEXT, INTEGER, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revert_booking_cancellation_after_stripe_error(
  UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, NUMERIC, NUMERIC, TEXT, INTEGER, JSONB
) TO service_role;
