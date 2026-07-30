// OAuth helpers for the Saoma Stripe App.
//
// Lets a venue connect its OWN Stripe account by consent instead of pasting its
// secret key. We receive a scoped access token (1h) plus a rotating refresh
// token (1y), both stored in Supabase Vault next to the legacy BYOK fields.
//
// Careful with the two different keys involved:
//   - the venue's access token  → used to call the API on the venue's account
//   - STRIPE_APP_SECRET_KEY     → OUR key, the one that owns the Saoma app.
//                                 It authenticates the code/refresh exchanges
//                                 only, and is never a venue's key.

// Note on webhooks: nothing here creates one. Stripe Apps refuse the
// `webhook_write` permission, and don't need it — the app registers ONE endpoint
// listening to all connected accounts, and each event carries `account: acct_…`.
// See docs/STRIPE_APP_OAUTH_SETUP.md.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const AUTHORIZE_URL = "https://marketplace.stripe.com/oauth/v2/authorize";
const TOKEN_URL = "https://api.stripe.com/v1/oauth/token";

/** Fallback TTL when Stripe does not return `expires_in` (documented at 1h). */
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

export interface StripeOAuthTokens {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  publishableKey: string | null;
  livemode: boolean;
  /** ISO timestamp at which the access token stops being valid. */
  expiresAt: string;
}

export class StripeOAuthError extends Error {
  readonly code: string;

  constructor(code: string, description?: string) {
    super(description ? `${code}: ${description}` : code);
    this.name = "StripeOAuthError";
    this.code = code;
  }
}

/**
 * The secret key of the Stripe account that owns the Saoma app. Falls back to
 * the platform key for the common case where the app was created on the same
 * account.
 */
function appSecretKey(): string {
  const key = Deno.env.get("STRIPE_APP_SECRET_KEY") ??
    Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) {
    throw new Error(
      "STRIPE_APP_SECRET_KEY (or STRIPE_SECRET_KEY) is not configured",
    );
  }
  return key;
}

/**
 * Redirect URI handed to Stripe. Must match `allowed_redirect_uris` in
 * saoma/stripe-app.json EXACTLY, so it is derived from SITE_URL and never from
 * `brand.appDomain` (which still points at a legacy domain).
 */
export function buildRedirectUri(): string {
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) {
    throw new Error(
      "SITE_URL is not configured — required to build the Stripe OAuth redirect URI",
    );
  }
  // Generic route namespace, provider as a path segment: adding a provider never
  // renames an existing URI, and the callback page knows which backend to call
  // without needing the provider stored on the state row.
  return `${siteUrl.replace(/\/+$/, "")}/admin/payment-oauth-callback/stripe`;
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = Deno.env.get("STRIPE_APP_CLIENT_ID");
  if (!clientId) {
    throw new Error("STRIPE_APP_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function requestTokens(
  params: Record<string, string>,
): Promise<StripeOAuthTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${appSecretKey()}:`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new StripeOAuthError(
      payload?.error ?? `http_${response.status}`,
      payload?.error_description,
    );
  }

  if (!payload.access_token || !payload.refresh_token) {
    throw new StripeOAuthError(
      "invalid_response",
      "Stripe did not return an access/refresh token pair",
    );
  }

  const ttl = typeof payload.expires_in === "number"
    ? payload.expires_in
    : DEFAULT_TOKEN_TTL_SECONDS;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accountId: payload.stripe_user_id ?? "",
    publishableKey: payload.stripe_publishable_key ?? null,
    livemode: payload.livemode === true,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

/** Step 3 of the flow: authorization code → tokens. The code is valid 5 min. */
export function exchangeCode(code: string): Promise<StripeOAuthTokens> {
  return requestTokens({
    grant_type: "authorization_code",
    code,
    // Stripe validates this against allowed_redirect_uris a second time.
    redirect_uri: buildRedirectUri(),
  });
}

/** Refresh tokens rotate: the response always carries a fresh one to store. */
export function refreshAccessToken(
  refreshToken: string,
): Promise<StripeOAuthTokens> {
  return requestTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/**
 * Write tokens to Vault + refresh the non-sensitive metadata on the row.
 *
 * Reuses the existing `payment_stripe_<hotel_id>` Vault secret so BYOK and
 * OAuth share one storage path. The legacy `stripe_secret_key` is dropped on
 * purpose once OAuth succeeds: keeping a full-power key around would defeat the
 * point of the migration, and would let the resolver silently fall back to a
 * stale credential.
 *
 * `stripe_webhook_secret` is cleared too: OAuth venues are covered by the single
 * app-level signing secret (STRIPE_APP_WEBHOOK_SECRET), not a per-venue one.
 */
export async function persistTokens(
  supabase: SupabaseClient,
  hotelId: string,
  tokens: StripeOAuthTokens,
  options: { markConnected?: boolean } = {},
): Promise<void> {
  const { data: existingRow } = await supabase
    .from("hotel_payment_configs")
    .select("stripe_vault_secret_id")
    .eq("hotel_id", hotelId)
    .maybeSingle();

  const payload = {
    stripe_secret_key: null,
    stripe_access_token: tokens.accessToken,
    stripe_refresh_token: tokens.refreshToken,
    stripe_webhook_secret: null,
  };

  const { data: secretId, error: vaultError } = await supabase.rpc(
    "upsert_payment_secret",
    {
      p_hotel_id: hotelId,
      p_provider: "stripe",
      p_payload: payload,
      p_existing_id: existingRow?.stripe_vault_secret_id ?? null,
    },
  );

  if (vaultError) {
    throw new Error(`Failed to store Stripe tokens: ${vaultError.message}`);
  }

  const row: Record<string, unknown> = {
    hotel_id: hotelId,
    provider: "stripe",
    auth_method: "oauth",
    stripe_vault_secret_id: secretId,
    livemode: tokens.livemode,
    oauth_expires_at: tokens.expiresAt,
    updated_at: new Date().toISOString(),
  };

  // A refresh response does not always echo the account id / publishable key —
  // only overwrite them when Stripe actually sent one, otherwise a routine
  // token refresh would blank out what the initial exchange stored.
  if (tokens.accountId) row.stripe_account_id = tokens.accountId;
  if (tokens.publishableKey) row.stripe_publishable_key = tokens.publishableKey;

  if (options.markConnected) {
    row.oauth_connected_at = new Date().toISOString();
  }

  const { error: upsertError } = await supabase
    .from("hotel_payment_configs")
    .upsert(row, { onConflict: "hotel_id" });

  if (upsertError) {
    throw new Error(`Failed to save Stripe config: ${upsertError.message}`);
  }
}
