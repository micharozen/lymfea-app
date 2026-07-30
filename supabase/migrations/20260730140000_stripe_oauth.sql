-- Stripe OAuth per venue (Saoma Stripe App).
--
-- Replaces "ask the venue for its sk_ secret key" (BYOK) with an OAuth consent
-- flow: the venue authorizes the Saoma app from its own Stripe Dashboard and we
-- store a scoped, refreshable access token instead of a full-power key.
--
-- BYOK is NOT removed: existing venues keep working. auth_method discriminates
-- the two paths and defaults to 'keys' (legacy).
--
-- Tokens themselves live in Supabase Vault, inside the SAME secret payload
-- already used for BYOK ('payment_stripe_<hotel_id>'), under the new keys
-- stripe_access_token / stripe_refresh_token. The existing
-- upsert_payment_secret / get_payment_stripe_secrets RPCs are reused as-is —
-- no Vault plumbing changes needed.

-- ============================================================
-- 1. CSRF state for the OAuth round-trip
-- ============================================================
-- One row per "connect" click, consumed exactly once by the callback.
--
-- Provider-agnostic on purpose: the flow is identical for any provider that
-- offers OAuth, and no provider column is needed because each provider gets its
-- own callback edge function (the redirect URI is declared per app).
CREATE TABLE IF NOT EXISTS public.payment_oauth_states (
  state      TEXT PRIMARY KEY,
  hotel_id   TEXT NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '10 minutes'
);

CREATE INDEX IF NOT EXISTS payment_oauth_states_expires_at_idx
  ON public.payment_oauth_states (expires_at);

-- RLS on with no policy at all: only service_role (edge functions) can touch it.
ALTER TABLE public.payment_oauth_states ENABLE ROW LEVEL SECURITY;

-- Consume a state exactly once. Returns nothing if unknown or expired, which
-- the caller must treat as a hard failure (replay / forged callback).
-- Also opportunistically purges expired rows.
CREATE OR REPLACE FUNCTION public.claim_payment_oauth_state(p_state TEXT)
RETURNS TABLE (hotel_id TEXT, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.payment_oauth_states WHERE expires_at < now();

  RETURN QUERY
  WITH claimed AS (
    DELETE FROM public.payment_oauth_states s
    WHERE s.state = p_state
      AND s.expires_at >= now()
    RETURNING s.hotel_id, s.user_id
  )
  SELECT c.hotel_id, c.user_id FROM claimed c;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_oauth_state(TEXT) TO service_role;

-- ============================================================
-- 2. OAuth metadata on the venue payment config
-- ============================================================
-- These columns are deliberately NOT prefixed by provider. The row already
-- carries a single `provider` and is UNIQUE per hotel_id, so it describes
-- exactly one active provider at a time — prefixing would be redundant with
-- that discriminator and would force an adyen_auth_method / adyen_oauth_*
-- duplicate for every future provider.
ALTER TABLE public.hotel_payment_configs
  -- 'keys'  → legacy BYOK, credentials pasted by the venue (default)
  -- 'oauth' → connected by consent, access/refresh token
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'keys',
  ADD COLUMN IF NOT EXISTS oauth_connected_at TIMESTAMPTZ,
  -- Access token expiry (1h for Stripe). Kept OUT of Vault so the resolver can
  -- check staleness on every call without a decrypt round-trip.
  ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ,
  -- Whether the connected account is in live or test mode. Note that Adyen
  -- already expresses this as adyen_environment ('test'|'live'); that legacy
  -- column is left untouched rather than unified here.
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN;

-- No per-venue webhook column on purpose. Stripe Apps refuse the
-- `webhook_write` permission ("requesting webhook_write permission is
-- disallowed"), and they don't need it: an app registers ONE endpoint listening
-- to events on all connected accounts, signed with a single app signing secret.
-- Each event then carries `account: acct_…`, which is how stripe-webhook maps it
-- back to a venue (via stripe_account_id).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_payment_configs_auth_method_check'
  ) THEN
    ALTER TABLE public.hotel_payment_configs
      ADD CONSTRAINT hotel_payment_configs_auth_method_check
      CHECK (auth_method IN ('keys', 'oauth'));
  END IF;
END $$;

COMMENT ON COLUMN public.hotel_payment_configs.auth_method IS
  'How we authenticate to the active provider: keys = credentials pasted by the venue (BYOK); oauth = access/refresh token obtained by consent';

-- App webhooks arrive on a single endpoint carrying `account: acct_…`, so every
-- incoming event does a reverse lookup on stripe_account_id. Index it.
CREATE INDEX IF NOT EXISTS hotel_payment_configs_stripe_account_id_idx
  ON public.hotel_payment_configs (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
