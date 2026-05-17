-- Abandoned carts tracking
-- Captures Stripe Checkout Sessions that the client opened but never completed,
-- enabling manual relaunch from the admin Marketing dashboard.

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  cart_items jsonb NOT NULL,
  schedule_mode text NOT NULL DEFAULT 'single' CHECK (schedule_mode IN ('single', 'per_item')),
  booking_date date,
  booking_time time,
  is_multi boolean NOT NULL DEFAULT false,
  total_price numeric(10, 2) NOT NULL DEFAULT 0,
  language text NOT NULL DEFAULT 'fr',
  therapist_gender text,
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  recovered_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS abandoned_carts_active_idx
  ON public.abandoned_carts (hotel_id, created_at DESC)
  WHERE recovered_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS abandoned_carts_customer_idx
  ON public.abandoned_carts (customer_id);

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Admins (not concierges) can read and update (for dismiss action).
CREATE POLICY "Admins read abandoned carts"
  ON public.abandoned_carts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update abandoned carts"
  ON public.abandoned_carts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role (edge functions) handles INSERT and recovery UPDATE; no explicit
-- policy needed since service_role bypasses RLS.

-- Public RPC: fetch the cart payload to repopulate the client booking flow.
-- Token = abandoned_cart.id (UUID v4 = 122 bits of entropy, non-guessable).
-- Returns null if already recovered, dismissed, or the booking date has passed.
CREATE OR REPLACE FUNCTION public.get_abandoned_cart_for_restore(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cart record;
  customer_row record;
BEGIN
  SELECT * INTO cart
  FROM public.abandoned_carts
  WHERE id = _id
    AND recovered_at IS NULL
    AND dismissed_at IS NULL
    AND (booking_date IS NULL OR booking_date >= CURRENT_DATE);

  IF cart IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT first_name, last_name, email, phone INTO customer_row
  FROM public.customers
  WHERE id = cart.customer_id;

  RETURN jsonb_build_object(
    'id', cart.id,
    'hotel_id', cart.hotel_id,
    'cart_items', cart.cart_items,
    'schedule_mode', cart.schedule_mode,
    'booking_date', cart.booking_date,
    'booking_time', cart.booking_time,
    'is_multi', cart.is_multi,
    'total_price', cart.total_price,
    'language', cart.language,
    'therapist_gender', cart.therapist_gender,
    'customer', jsonb_build_object(
      'first_name', customer_row.first_name,
      'last_name', customer_row.last_name,
      'email', customer_row.email,
      'phone', customer_row.phone
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_for_restore(uuid) TO anon, authenticated;
