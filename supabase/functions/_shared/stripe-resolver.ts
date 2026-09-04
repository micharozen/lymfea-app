// Resolves the right Stripe client for a given venue.
//
// Priority:
//   1. Venue connected via OAuth (Saoma Stripe App) → its access token,
//      refreshed transparently when it is about to expire.
//   2. Venue on legacy BYOK → the secret key it pasted, read from Vault.
//   3. Venue with NO credential of its own → the global STRIPE_SECRET_KEY.
//
// A venue that declares a credential but whose credential is unreadable is an
// error, never a fallback — see VenueStripeCredentialError.
//
// Also exposes the venue's Stripe account_id (if any) and the per-venue webhook
// secret needed by stripe-webhook.

import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  persistTokens,
  refreshAccessToken,
  StripeOAuthError,
} from "./stripe-oauth.ts";

const STRIPE_API_VERSION = "2025-08-27.basil" as const;

/** Refresh this long before actual expiry, to absorb clock skew and latency. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** How a caller that lost the refresh claim waits for the winner's token. */
const REFRESH_WAIT_MS = 700;
const REFRESH_WAIT_ATTEMPTS = 4;

/**
 * A venue declares a Stripe credential but it cannot be used.
 *
 * Never fall back to the platform key here: the venue's customers, payment
 * intents and payouts live on ITS account, so the platform key would silently
 * charge the wrong account instead of failing.
 */
export class VenueStripeCredentialError extends Error {
  readonly hotelId: string;

  constructor(hotelId: string, reason: string) {
    super(`Stripe credential unusable for venue ${hotelId}: ${reason}`);
    this.name = "VenueStripeCredentialError";
    this.hotelId = hotelId;
  }
}

export interface ResolvedStripe {
  client: Stripe;
  source: "venue" | "global";
  /** How the venue credential was obtained. Null when falling back to global. */
  authMethod: "oauth" | "keys" | null;
  hotelId: string | null;
  accountId: string | null;
  webhookSecret: string | null;
}

interface CacheEntry {
  resolved: ResolvedStripe;
  /** Epoch ms after which the entry must be re-resolved. Infinity = never. */
  expiresAt: number;
}

const venueCache = new Map<string, CacheEntry>();
let globalCache: ResolvedStripe | null = null;

function buildStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

function cache(hotelId: string, resolved: ResolvedStripe, expiresAt: number) {
  venueCache.set(hotelId, { resolved, expiresAt });
  return resolved;
}

export function getGlobalStripe(): ResolvedStripe {
  if (globalCache) return globalCache;
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  globalCache = {
    client: buildStripe(key),
    source: "global",
    authMethod: null,
    hotelId: null,
    accountId: null,
    webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null,
  };
  return globalCache;
}

export function clearStripeResolverCache(hotelId?: string) {
  if (hotelId) {
    venueCache.delete(hotelId);
  } else {
    venueCache.clear();
    globalCache = null;
  }
}

/** Read the decrypted Stripe payload for a venue, or null. */
async function readVaultSecrets(
  supabase: SupabaseClient,
  hotelId: string,
): Promise<Record<string, string | null> | null> {
  const { data, error } = await supabase.rpc("get_payment_stripe_secrets", {
    p_hotel_id: hotelId,
  });
  if (error || !data || typeof data !== "object") return null;
  return data as Record<string, string | null>;
}

/**
 * Read the access token another caller may have just rotated in.
 *
 * Returns null when Vault still holds `staleToken`: reusing it would send an
 * expired key to Stripe, which answers `platform_api_key_expired` — an error
 * that reads like a revoked installation and hides the real cause.
 */
async function readRotatedToken(
  supabase: SupabaseClient,
  hotelId: string,
  staleToken: string | null,
): Promise<string | null> {
  const fresh = await readVaultSecrets(supabase, hotelId);
  const token = fresh?.stripe_access_token ?? null;
  return token && token !== staleToken ? token : null;
}

/** A lease is short: poll a few times rather than fail while the winner writes. */
async function awaitRotatedToken(
  supabase: SupabaseClient,
  hotelId: string,
  staleToken: string | null,
): Promise<string | null> {
  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_MS));
    const token = await readRotatedToken(supabase, hotelId, staleToken);
    if (token) return token;
  }
  return null;
}

/**
 * Return a usable access token, refreshing it if it is expired or close to it.
 *
 * Refresh tokens are single-use and rotate, and the pair belongs to the Stripe
 * ACCOUNT — so every venue on that account refreshes the same credential. The
 * claim serializes them: the winner exchanges the token and writes the new pair
 * for all of them, the losers just wait for it to land in Vault.
 */
async function resolveAccessToken(
  supabase: SupabaseClient,
  hotelId: string,
  accountId: string | null,
  secrets: Record<string, string | null>,
  expiresAt: string | null,
): Promise<{ token: string; expiresAt: string } | null> {
  const stillValid = expiresAt !== null &&
    new Date(expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS;

  if (stillValid && secrets.stripe_access_token) {
    return { token: secrets.stripe_access_token, expiresAt };
  }

  const refreshToken = secrets.stripe_refresh_token;
  if (!refreshToken) {
    console.error(`[stripe-resolver] hotel=${hotelId} oauth without refresh token`);
    return null;
  }

  const { data: claimed } = await supabase.rpc("claim_stripe_oauth_refresh", {
    p_account_id: accountId ?? "",
  });

  if (claimed === false) {
    const rotated = await awaitRotatedToken(supabase, hotelId, secrets.stripe_access_token);
    if (rotated) {
      console.log(`[stripe-resolver] hotel=${hotelId} used the token refreshed by a sibling`);
      // Expiry is unknown here; a short lease forces a re-read soon.
      return {
        token: rotated,
        expiresAt: new Date(Date.now() + REFRESH_MARGIN_MS).toISOString(),
      };
    }
    console.error(
      `[stripe-resolver] hotel=${hotelId} refresh claimed elsewhere but no fresh token appeared`,
    );
    return null;
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    await persistTokens(supabase, hotelId, tokens);
    console.log(`[stripe-resolver] hotel=${hotelId} token refreshed`);
    return { token: tokens.accessToken, expiresAt: tokens.expiresAt };
  } catch (err) {
    // `invalid_grant` means the refresh token is gone for good — typically
    // consumed by a rotation whose result was lost, or revoked by a later
    // authorization of the same account. Only a token someone else just wrote
    // can save the call; the stored one is expired and must never be resent.
    if (err instanceof StripeOAuthError && err.code === "invalid_grant") {
      const rotated = await readRotatedToken(supabase, hotelId, secrets.stripe_access_token);
      if (rotated) {
        console.log(`[stripe-resolver] hotel=${hotelId} lost the refresh race, using the stored token`);
        return {
          token: rotated,
          expiresAt: new Date(Date.now() + REFRESH_MARGIN_MS).toISOString(),
        };
      }
    }
    console.error(`[stripe-resolver] hotel=${hotelId} token refresh failed:`, err);
    return null;
  }
}

/**
 * Surface a dead connection in the admin UI. Best effort: the caller is about to
 * throw anyway, and a venue whose Stripe is broken must not also fail on this.
 */
async function markConnectionFailed(
  supabase: SupabaseClient,
  hotelId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("hotel_payment_configs")
    .update({ connection_status: "failed", connection_error: reason })
    .eq("hotel_id", hotelId);

  if (error) {
    console.error(`[stripe-resolver] hotel=${hotelId} could not flag the failure:`, error);
  }
}

export async function getStripeForVenue(
  supabase: SupabaseClient,
  hotelId: string | null | undefined,
): Promise<ResolvedStripe> {
  if (!hotelId) {
    const resolved = getGlobalStripe();
    console.log(`[stripe-resolver] hotel=<none> source=global`);
    return resolved;
  }

  const cached = venueCache.get(hotelId);
  if (cached && cached.expiresAt > Date.now()) return cached.resolved;

  const { data: cfg } = await supabase
    .from("hotel_payment_configs")
    .select(
      "provider, stripe_account_id, stripe_vault_secret_id, auth_method, oauth_expires_at",
    )
    .eq("hotel_id", hotelId)
    .maybeSingle();

  if (cfg?.provider === "stripe" && cfg.stripe_vault_secret_id) {
    const secrets = await readVaultSecrets(supabase, hotelId);

    if (secrets && cfg.auth_method === "oauth") {
      const access = await resolveAccessToken(
        supabase,
        hotelId,
        cfg.stripe_account_id ?? null,
        secrets,
        cfg.oauth_expires_at ?? null,
      );

      if (access) {
        console.log(`[stripe-resolver] hotel=${hotelId} source=venue auth=oauth`);
        return cache(
          hotelId,
          {
            client: buildStripe(access.token),
            source: "venue",
            authMethod: "oauth",
            hotelId,
            accountId: cfg.stripe_account_id ?? null,
            webhookSecret: secrets.stripe_webhook_secret ?? null,
          },
          // Never outlive the token itself.
          new Date(access.expiresAt).getTime() - REFRESH_MARGIN_MS,
        );
      }

      const reason = "OAuth token missing or refresh failed — reconnect Stripe";
      await markConnectionFailed(supabase, hotelId, reason);
      throw new VenueStripeCredentialError(hotelId, reason);
    } else if (secrets?.stripe_secret_key) {
      console.log(`[stripe-resolver] hotel=${hotelId} source=venue auth=keys`);
      return cache(
        hotelId,
        {
          client: buildStripe(secrets.stripe_secret_key),
          source: "venue",
          authMethod: "keys",
          hotelId,
          accountId: cfg.stripe_account_id ?? null,
          webhookSecret: secrets.stripe_webhook_secret ?? null,
        },
        Infinity,
      );
    } else {
      throw new VenueStripeCredentialError(
        hotelId,
        "Vault holds no usable credential for this venue",
      );
    }
  }

  // Fallback: global key, but record the venue's account_id if present.
  const global = getGlobalStripe();
  console.log(`[stripe-resolver] hotel=${hotelId} source=global (no venue credential)`);
  return cache(
    hotelId,
    {
      ...global,
      hotelId,
      accountId: cfg?.stripe_account_id ?? null,
    },
    Date.now() + 60_000,
  );
}
