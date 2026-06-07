-- =========================================================================
-- Stripe Billing — Subscriptions, Plans, Webhook Idempotency
-- =========================================================================
-- One Stripe Customer + Subscription per organization. Per-seat model:
-- 1 hotel (venue) = 1 seat. Tiers (Starter / Pro / Enterprise) gate features
-- via plans.features jsonb. Enterprise has no Stripe price (contact-sales).
--
-- Separate from Stripe Connect (therapist payouts) — uses STRIPE_BILLING_*
-- env vars in edge functions, never STRIPE_SECRET_KEY.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. plans
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  stripe_product_id text,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  monthly_amount_cents integer,
  yearly_amount_cents integer,
  currency text NOT NULL DEFAULT 'eur',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_code_check CHECK (code IN ('starter', 'pro', 'enterprise'))
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- World-readable for the public pricing page; only active rows.
CREATE POLICY plans_select_active ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY plans_select_all_service ON public.plans
  FOR SELECT
  TO service_role
  USING (true);

-- All writes go through service-role.
CREATE POLICY plans_service_write ON public.plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed rows. Stripe IDs are filled by scripts/seed-billing-plans.ts.
INSERT INTO public.plans (code, name, description, monthly_amount_cents, yearly_amount_cents, currency, features, sort_order)
VALUES
  (
    'starter',
    'Starter',
    'Pour démarrer avec l''essentiel.',
    14900,
    149000, -- ~2 months free over 12
    'eur',
    '["agenda","pwa","booking","billing","support"]'::jsonb,
    10
  ),
  (
    'pro',
    'Pro',
    'Pour les spas en croissance.',
    24900,
    249000,
    'eur',
    '["agenda","pwa","booking","billing","support","pms_integration","auto_billing","gift_cards","multi_therapist","priority_support"]'::jsonb,
    20
  ),
  (
    'enterprise',
    'Enterprise',
    'Pour les groupes hôteliers multi-sites.',
    NULL,
    NULL,
    'eur',
    '["agenda","pwa","booking","billing","support","pms_integration","auto_billing","gift_cards","multi_therapist","priority_support","multi_venue","custom_branding","sla","dedicated_csm","custom_integrations"]'::jsonb,
    30
  )
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. subscriptions
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_subscription_item_id text,
  status text NOT NULL,
  billing_cycle text,
  seats integer NOT NULL DEFAULT 1,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  trial_end timestamptz,
  default_payment_method text,
  latest_invoice_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (status IN (
    'trialing','active','past_due','canceled','incomplete',
    'incomplete_expired','unpaid','paused'
  )),
  CONSTRAINT subscriptions_billing_cycle_check CHECK (
    billing_cycle IS NULL OR billing_cycle IN ('monthly','yearly')
  ),
  CONSTRAINT subscriptions_seats_check CHECK (seats >= 0)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Org-admins read their own org's subscription; super-admins read all.
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY subscriptions_service_write ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public.subscriptions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.subscriptions_set_updated_at();

-- -------------------------------------------------------------------------
-- 3. billing_webhook_events (idempotency)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_webhook_events_service ON public.billing_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------------------------
-- 4. Helper functions
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organization_has_active_billing(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE organization_id = _org
      AND status IN ('trialing','active','past_due')
  )
$$;

GRANT EXECUTE ON FUNCTION public.organization_has_active_billing(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_organization_features(_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'plan_code', p.code,
    'features', COALESCE(p.features, '[]'::jsonb),
    'status', s.status,
    'seats', s.seats,
    'billing_cycle', s.billing_cycle,
    'current_period_end', s.current_period_end,
    'trial_end', s.trial_end,
    'cancel_at_period_end', s.cancel_at_period_end
  )
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = _org
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_features(uuid) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 5. Seat-capacity trigger on hotels
-- -------------------------------------------------------------------------
-- Defence in depth: even if a client bypasses the UI, INSERTs into hotels
-- are blocked when the org has no active billing or has run out of seats.
-- The UX path always preflights the quantity upgrade via the edge function.

CREATE OR REPLACE FUNCTION public.enforce_hotel_seat_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_used integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'hotel.organization_id is required';
  END IF;

  -- Read subscription for the org.
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE organization_id = NEW.organization_id;

  -- No subscription row → block (org has not signed up to billing yet).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription for organization %', NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Status must grant write access.
  IF v_sub.status NOT IN ('trialing','active','past_due') THEN
    RAISE EXCEPTION 'Subscription is not active (status=%)', v_sub.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Count current hotels for that org.
  SELECT count(*) INTO v_used
  FROM public.hotels
  WHERE organization_id = NEW.organization_id;

  IF v_used + 1 > v_sub.seats THEN
    RAISE EXCEPTION 'Seat capacity exceeded (% used / % seats). Upgrade the subscription before adding a new venue.',
      v_used, v_sub.seats
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_hotel_seat_capacity ON public.hotels;
CREATE TRIGGER trg_enforce_hotel_seat_capacity
  BEFORE INSERT ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hotel_seat_capacity();

-- -------------------------------------------------------------------------
-- 6. Backfill existing organizations with a complimentary Enterprise sub
-- -------------------------------------------------------------------------
-- Avoids breaking the seat trigger for orgs that already exist. Status is
-- 'active', seats = max(1, current_hotel_count). stripe_customer_id is a
-- placeholder ('manual:<org_id>') and stripe_subscription_id stays NULL.
-- Ops will replace these once Stripe Billing is live.

INSERT INTO public.subscriptions (
  organization_id,
  plan_id,
  stripe_customer_id,
  status,
  billing_cycle,
  seats,
  metadata
)
SELECT
  o.id,
  (SELECT id FROM public.plans WHERE code = 'enterprise' LIMIT 1),
  'manual:' || o.id::text,
  'active',
  NULL,
  GREATEST(4, (SELECT count(*) FROM public.hotels h WHERE h.organization_id = o.id)),
  jsonb_build_object('source', 'backfill_pre_billing')
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id
);
