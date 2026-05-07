-- Payment provider configuration per venue
-- Mirrors the PMS pattern: dedicated table, admin-only RLS, lightweight flag on hotels.
-- Initial scope: store credentials + run a "test connection" check.
-- The current Stripe payment flow keeps using the global STRIPE_SECRET_KEY env var.

-- 1. Dedicated payment config table (credentials isolated, admin-only access)
CREATE TABLE IF NOT EXISTS public.hotel_payment_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'none',

  -- Stripe fields
  stripe_secret_key TEXT,
  stripe_publishable_key TEXT,
  stripe_webhook_secret TEXT,
  stripe_account_id TEXT,

  -- Adyen fields
  adyen_api_key TEXT,
  adyen_merchant_account TEXT,
  adyen_environment TEXT,
  adyen_client_key TEXT,
  adyen_hmac_key TEXT,

  -- Connection status
  connection_status TEXT,
  connection_verified_at TIMESTAMPTZ,
  connection_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hotel_id)
);

ALTER TABLE public.hotel_payment_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage payment configs"
  ON public.hotel_payment_configs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Lightweight flag on hotels (avoid joining for read-only filtering)
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT NULL;
