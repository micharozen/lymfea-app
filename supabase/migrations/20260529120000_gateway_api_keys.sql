-- External API gateway: API keys issued to third-party applications.
--
-- The key SECRET is stored encrypted in Supabase Vault (reversible, so it can be
-- re-displayed in the admin), mirroring how Stripe/Adyen credentials are handled
-- in 20260428120000_encrypt_payment_credentials.sql.
--
-- The relational METADATA (third-party name, scopes, prefix, revocation, …) lives
-- in a dedicated `gateway` schema that is NOT exposed to PostgREST, so the table
-- is invisible from the REST/anon API surface.
--
-- All access goes through SECURITY DEFINER functions in `public`, executable only
-- by service_role (the Hono backend uses the service-role client).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Dedicated schema (kept out of the PostgREST "Exposed schemas" list).
CREATE SCHEMA IF NOT EXISTS gateway;
REVOKE ALL ON SCHEMA gateway FROM anon, authenticated;

-- 2. Metadata table. The secret itself is never stored here — only a Vault ref.
CREATE TABLE IF NOT EXISTS gateway.api_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,                                   -- identifies the third party
  hotel_id           TEXT REFERENCES public.hotels(id) ON DELETE CASCADE, -- NULL = platform-wide
  key_prefix         TEXT NOT NULL UNIQUE,                            -- e.g. sk_live_ab12cd34 (cleartext, for lookup + display)
  vault_secret_id    UUID REFERENCES vault.secrets(id) ON DELETE SET NULL,
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_min INTEGER,
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Verify a presented key. Returns scopes/hotel_id as JSONB when valid, else NULL.
--    Parses the prefix from the full key, looks up the row, decrypts the stored
--    secret from the Vault and compares it to what the caller presented.
CREATE OR REPLACE FUNCTION public.gateway_verify_api_key(_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_prefix    TEXT;
  v_row       gateway.api_keys%ROWTYPE;
  v_decrypted TEXT;
BEGIN
  IF _key IS NULL THEN
    RETURN NULL;
  END IF;

  -- Prefix = "sk_live_<hex>" up to (and including) the random identifier segment.
  v_prefix := substring(_key FROM '^(sk_live_[0-9a-f]+)_');
  IF v_prefix IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM gateway.api_keys
  WHERE key_prefix = v_prefix;

  IF NOT FOUND OR v_row.revoked_at IS NOT NULL OR v_row.vault_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_row.vault_secret_id;

  IF v_decrypted IS NULL OR v_decrypted <> _key THEN
    RETURN NULL;
  END IF;

  UPDATE gateway.api_keys SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'id',       v_row.id,
    'name',     v_row.name,
    'hotel_id', v_row.hotel_id,
    'scopes',   to_jsonb(v_row.scopes)
  );
END;
$$;

-- 4. Create a key for a third party. Generates the secret, stores it in the Vault,
--    inserts the metadata row and returns the FULL key in cleartext (shown to the
--    admin so it can be transmitted to the third party).
CREATE OR REPLACE FUNCTION public.gateway_create_api_key(
  _name       TEXT,
  _hotel_id   TEXT DEFAULT NULL,
  _scopes     TEXT[] DEFAULT '{}',
  _rate_limit INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_prefix    TEXT;
  v_full      TEXT;
  v_secret_id UUID;
  v_id        UUID;
BEGIN
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  v_prefix := 'sk_live_' || encode(gen_random_bytes(4), 'hex');     -- sk_live_ + 8 hex chars
  v_full   := v_prefix || '_' || encode(gen_random_bytes(24), 'hex');

  v_secret_id := vault.create_secret(
    v_full,
    'gateway_apikey_' || v_prefix,
    'API key "' || _name || '"'
  );

  INSERT INTO gateway.api_keys (name, hotel_id, key_prefix, vault_secret_id, scopes, rate_limit_per_min)
  VALUES (_name, _hotel_id, v_prefix, v_secret_id, COALESCE(_scopes, '{}'), _rate_limit)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',                 v_id,
    'name',               _name,
    'hotel_id',           _hotel_id,
    'key_prefix',         v_prefix,
    'scopes',             to_jsonb(COALESCE(_scopes, '{}'::text[])),
    'rate_limit_per_min', _rate_limit,
    'api_key',            v_full
  );
END;
$$;

-- 5. Re-reveal the full key of an existing third party (decrypts from the Vault).
CREATE OR REPLACE FUNCTION public.gateway_reveal_api_key(_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret_id UUID;
  v_decrypted TEXT;
BEGIN
  SELECT vault_secret_id INTO v_secret_id FROM gateway.api_keys WHERE id = _id;
  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_decrypted FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_decrypted;
END;
$$;

-- 6. List keys (metadata only — never the secret).
CREATE OR REPLACE FUNCTION public.gateway_list_api_keys()
RETURNS TABLE(
  id                 UUID,
  name               TEXT,
  hotel_id           TEXT,
  key_prefix         TEXT,
  scopes             TEXT[],
  rate_limit_per_min INTEGER,
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, hotel_id, key_prefix, scopes, rate_limit_per_min,
         last_used_at, revoked_at, created_at
  FROM gateway.api_keys
  ORDER BY created_at DESC;
$$;

-- 7. Revoke a key (soft — keeps the row for audit, sets revoked_at).
CREATE OR REPLACE FUNCTION public.gateway_revoke_api_key(_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE gateway.api_keys SET revoked_at = now() WHERE id = _id AND revoked_at IS NULL;
END;
$$;

-- 8. Lock down execution: service_role only (the backend), never anon/authenticated.
REVOKE ALL ON FUNCTION public.gateway_verify_api_key(TEXT)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gateway_create_api_key(TEXT, TEXT, TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gateway_reveal_api_key(UUID)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gateway_list_api_keys()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gateway_revoke_api_key(UUID)                        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gateway_verify_api_key(TEXT)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.gateway_create_api_key(TEXT, TEXT, TEXT[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.gateway_reveal_api_key(UUID)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.gateway_list_api_keys()                             TO service_role;
GRANT EXECUTE ON FUNCTION public.gateway_revoke_api_key(UUID)                        TO service_role;
