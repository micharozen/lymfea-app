-- =========================================================================
-- Codes promo — restitution à l'annulation
-- =========================================================================
-- Migration séparée de 20260915160000 : celle-ci est déjà mergée, et donc
-- potentiellement déjà appliquée. La modifier ne rejouerait rien.
--
-- begin_booking_cancellation restitue déjà les avoirs ; elle restitue
-- désormais aussi le code promo — la ligne d'audit est supprimée, le compteur
-- décrémenté et la réservation perd sa marque de code. Sans cela, un client
-- annulant perdait définitivement son droit sur un code limité à une
-- utilisation, et un code plafonné perdait un usage à chaque annulation.
--
-- Exception : si le lieu retient des frais d'annulation, il y a eu une
-- transaction et un encaissement — le code reste alors consommé.
--
-- La fonction est redéfinie en entier ; seuls le bloc promo et les deux CASE
-- sur `bookings` diffèrent de la version précédente.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.begin_booking_cancellation(
  _booking_id uuid,
  _reason text,
  _cancelled_by uuid,
  _cancellation_fee_amount numeric,
  _refund_amount numeric
)
RETURNS SETOF bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_status TEXT;
  _gift_restored_cents INTEGER := 0;
BEGIN
  IF _cancelled_by IS NULL THEN
    PERFORM set_config('app.audit_source', 'client', true);
  END IF;

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

  -- Code promo : le compteur du code redescend et la ligne d'audit disparaît,
  -- pour que le client retrouve son droit et que le total remisé ne compte pas
  -- une remise qui n'a pas eu lieu.
  --
  -- Sauf si le lieu retient des frais d'annulation : il y a alors eu une
  -- transaction et un encaissement, le code est donc réputé consommé.
  WITH released AS (
    DELETE FROM public.promo_code_redemptions
    WHERE booking_id = _booking_id
      AND COALESCE(_cancellation_fee_amount, 0) = 0
    RETURNING promo_code_id
  )
  UPDATE public.promo_codes p
  SET redemption_count = GREATEST(0, p.redemption_count - 1),
      updated_at = NOW()
  FROM released
  WHERE p.id = released.promo_code_id;

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
    _cancelled_by,
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
    status = 'cancelled',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    gift_amount_applied_cents = GREATEST(0, gift_amount_applied_cents - _gift_restored_cents),
    -- total_price reste le montant réellement dû au moment de la réservation ;
    -- seule la marque du code est retirée, et uniquement quand le droit a été
    -- rendu — avec des frais retenus, la réservation garde la trace du code.
    promo_code_id = CASE
      WHEN COALESCE(_cancellation_fee_amount, 0) = 0 THEN NULL
      ELSE promo_code_id
    END,
    promo_discount_cents = CASE
      WHEN COALESCE(_cancellation_fee_amount, 0) = 0 THEN 0
      ELSE promo_discount_cents
    END
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$$;
