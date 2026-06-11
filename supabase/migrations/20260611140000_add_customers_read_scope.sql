-- =========================================================================
-- Add `customers:read` scope to org API keys
-- =========================================================================
-- The customers API (introduced in 20260611130000_gateway_customers_api.sql)
-- is gated by a new `customers:read` scope. We patch the org key generator to
-- include it by default, and backfill every existing org key so partners can
-- call the new endpoints without manual intervention.
-- =========================================================================

-- 1. Patch gateway_create_org_api_key to include `customers:read`.
--    Function body mirrors the original in 20260611120000_gateway_api_keys_org_scope.sql
--    with the scope list updated.
CREATE OR REPLACE FUNCTION public.gateway_create_org_api_key(_org_id UUID)
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
  v_org_name  TEXT;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = _org_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'organization % not found', _org_id;
  END IF;

  -- Revoke any active key for this org so the partial unique index is satisfied.
  UPDATE gateway.api_keys
    SET revoked_at = now()
    WHERE organization_id = _org_id AND revoked_at IS NULL;

  v_prefix := 'sk_live_' || encode(gen_random_bytes(4), 'hex');
  v_full   := v_prefix || '_' || encode(gen_random_bytes(24), 'hex');

  v_secret_id := vault.create_secret(
    v_full,
    'gateway_apikey_' || v_prefix,
    'API key (org "' || v_org_name || '")'
  );

  INSERT INTO gateway.api_keys (
    name, hotel_id, organization_id, key_prefix, vault_secret_id, scopes, rate_limit_per_min
  )
  VALUES (
    v_org_name,
    NULL,
    _org_id,
    v_prefix,
    v_secret_id,
    ARRAY['venues:read', 'treatments:read', 'customers:read', 'bookings:read', 'therapists:read'],
    NULL
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',         v_id,
    'key_prefix', v_prefix,
    'api_key',    v_full
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gateway_create_org_api_key(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_create_org_api_key(UUID) TO service_role;

-- 2. Backfill every existing active org key with the new scope.
UPDATE gateway.api_keys
   SET scopes = array_append(scopes, 'customers:read')
 WHERE revoked_at IS NULL
   AND organization_id IS NOT NULL
   AND NOT ('customers:read' = ANY (scopes));
