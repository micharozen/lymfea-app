-- Move payment credentials from cleartext columns into Supabase Vault.
-- Sensitive fields are removed from public.hotel_payment_configs and replaced
-- with vault.secrets(id) references. Reads happen via SECURITY DEFINER
-- functions executable only by service_role (edge functions).

-- 1. Add Vault reference columns
ALTER TABLE public.hotel_payment_configs
  ADD COLUMN IF NOT EXISTS stripe_vault_secret_id UUID REFERENCES vault.secrets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adyen_vault_secret_id  UUID REFERENCES vault.secrets(id) ON DELETE SET NULL;

-- 2. Backfill: for every row that has any cleartext secret, create a Vault
--    secret holding the JSON payload and store its UUID in the table.
DO $$
DECLARE
  cfg RECORD;
  v_secret_id UUID;
  v_payload   TEXT;
BEGIN
  FOR cfg IN SELECT * FROM public.hotel_payment_configs LOOP
    -- Stripe
    IF cfg.stripe_secret_key IS NOT NULL OR cfg.stripe_webhook_secret IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'stripe_secret_key',     cfg.stripe_secret_key,
        'stripe_webhook_secret', cfg.stripe_webhook_secret
      )::text;
      v_secret_id := vault.create_secret(
        v_payload,
        'payment_stripe_' || cfg.hotel_id,
        'Stripe credentials for hotel ' || cfg.hotel_id
      );
      UPDATE public.hotel_payment_configs
      SET stripe_vault_secret_id = v_secret_id
      WHERE id = cfg.id;
    END IF;

    -- Adyen
    IF cfg.adyen_api_key IS NOT NULL OR cfg.adyen_hmac_key IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'adyen_api_key',  cfg.adyen_api_key,
        'adyen_hmac_key', cfg.adyen_hmac_key
      )::text;
      v_secret_id := vault.create_secret(
        v_payload,
        'payment_adyen_' || cfg.hotel_id,
        'Adyen credentials for hotel ' || cfg.hotel_id
      );
      UPDATE public.hotel_payment_configs
      SET adyen_vault_secret_id = v_secret_id
      WHERE id = cfg.id;
    END IF;
  END LOOP;
END $$;

-- 3. Drop cleartext columns
ALTER TABLE public.hotel_payment_configs
  DROP COLUMN IF EXISTS stripe_secret_key,
  DROP COLUMN IF EXISTS stripe_webhook_secret,
  DROP COLUMN IF EXISTS adyen_api_key,
  DROP COLUMN IF EXISTS adyen_hmac_key;

-- 4. SECURITY DEFINER readers — service_role only.
--    Returns NULL if no secret is configured for the hotel.

CREATE OR REPLACE FUNCTION public.get_payment_stripe_secrets(p_hotel_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_decrypted TEXT;
BEGIN
  SELECT stripe_vault_secret_id INTO v_secret_id
  FROM public.hotel_payment_configs
  WHERE hotel_id = p_hotel_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_decrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_decrypted::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_adyen_secrets(p_hotel_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_decrypted TEXT;
BEGIN
  SELECT adyen_vault_secret_id INTO v_secret_id
  FROM public.hotel_payment_configs
  WHERE hotel_id = p_hotel_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_decrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_decrypted::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_stripe_secrets(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payment_adyen_secrets(TEXT)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_stripe_secrets(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_adyen_secrets(TEXT)  TO service_role;

-- 5. SECURITY DEFINER writer — service_role only.
--    Creates or updates the Vault secret for a (hotel, provider) and returns
--    the secret UUID so the caller can persist it on the row.
--    The payload is opaque JSON so the caller controls the schema.

CREATE OR REPLACE FUNCTION public.upsert_payment_secret(
  p_hotel_id    TEXT,
  p_provider    TEXT,         -- 'stripe' | 'adyen'
  p_payload     JSONB,
  p_existing_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_name      TEXT;
BEGIN
  IF p_provider NOT IN ('stripe', 'adyen') THEN
    RAISE EXCEPTION 'Unsupported provider: %', p_provider;
  END IF;

  v_name := 'payment_' || p_provider || '_' || p_hotel_id;

  IF p_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(p_existing_id, p_payload::text, v_name);
    RETURN p_existing_id;
  END IF;

  v_secret_id := vault.create_secret(
    p_payload::text,
    v_name,
    p_provider || ' credentials for hotel ' || p_hotel_id
  );
  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_payment_secret(p_secret_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF p_secret_id IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_payment_secret(TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_payment_secret(UUID)                    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_payment_secret(TEXT, TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_payment_secret(UUID)                    TO service_role;
