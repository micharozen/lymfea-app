// Node counterpart of supabase/functions/_shared/stripe-oauth.ts.
//
// The backend never *starts* an OAuth flow (that lives in the edge functions);
// it only needs to keep an existing venue connection alive, so this module is
// limited to refreshing and persisting tokens.

import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://api.stripe.com/v1/oauth/token";

/** Fallback TTL when Stripe does not return `expires_in` (documented at 1h). */
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

export interface StripeOAuthTokens {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  publishableKey: string | null;
  livemode: boolean;
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
 * Our own key — the one owning the Saoma Stripe app. It authenticates the
 * refresh exchange and is never a venue's key.
 */
function appSecretKey(): string {
  const key = process.env.STRIPE_APP_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    throw new Error("STRIPE_APP_SECRET_KEY (or STRIPE_SECRET_KEY) is not configured");
  }
  return key;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<StripeOAuthTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${appSecretKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
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

/** Mirror of the Deno `persistTokens`; see it for the rationale. */
export async function persistTokens(
  supabase: SupabaseClient,
  hotelId: string,
  tokens: StripeOAuthTokens,
): Promise<void> {
  const { data: existingRow } = await supabase
    .from("hotel_payment_configs")
    .select("stripe_vault_secret_id")
    .eq("hotel_id", hotelId)
    .maybeSingle();

  let currentWebhookSecret: string | null = null;
  if (existingRow?.stripe_vault_secret_id) {
    const { data: current } = await supabase.rpc("get_payment_stripe_secrets", {
      p_hotel_id: hotelId,
    });
    if (current && typeof current === "object") {
      currentWebhookSecret =
        (current as Record<string, string | null>).stripe_webhook_secret ?? null;
    }
  }

  const { data: secretId, error: vaultError } = await supabase.rpc(
    "upsert_payment_secret",
    {
      p_hotel_id: hotelId,
      p_provider: "stripe",
      p_payload: {
        stripe_secret_key: null,
        stripe_access_token: tokens.accessToken,
        stripe_refresh_token: tokens.refreshToken,
        stripe_webhook_secret: currentWebhookSecret,
      },
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
  if (tokens.accountId) row.stripe_account_id = tokens.accountId;
  if (tokens.publishableKey) row.stripe_publishable_key = tokens.publishableKey;

  const { error: upsertError } = await supabase
    .from("hotel_payment_configs")
    .upsert(row, { onConflict: "hotel_id" });

  if (upsertError) {
    throw new Error(`Failed to save Stripe config: ${upsertError.message}`);
  }
}
