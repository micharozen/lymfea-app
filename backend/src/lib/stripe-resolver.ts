// Node counterpart of supabase/functions/_shared/stripe-resolver.ts —
// keep the two in sync.
//
// Priority:
//   1. Venue connected via OAuth (Saoma Stripe App) → its access token,
//      refreshed transparently when it is about to expire.
//   2. Venue on legacy BYOK → the secret key it pasted, read from Vault.
//   3. Otherwise → the global STRIPE_SECRET_KEY env var.

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistTokens, refreshAccessToken, StripeOAuthError } from "./stripe-oauth";

const STRIPE_API_VERSION = "2025-08-27.basil" as const;

/** Refresh this long before actual expiry, to absorb clock skew and latency. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  globalCache = {
    client: buildStripe(key),
    source: "global",
    authMethod: null,
    hotelId: null,
    accountId: null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
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
 * Return a usable access token, refreshing it if it is expired or close to it.
 *
 * Refresh tokens rotate, so concurrent refreshes mean one caller gets
 * `invalid_grant`; it just re-reads Vault where the winner stored a fresh
 * token. No locking needed.
 */
async function resolveAccessToken(
  supabase: SupabaseClient,
  hotelId: string,
  secrets: Record<string, string | null>,
  expiresAt: string | null,
): Promise<{ token: string; expiresAt: string } | null> {
  const stillValid =
    expiresAt !== null &&
    new Date(expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS;

  if (stillValid && secrets.stripe_access_token) {
    return { token: secrets.stripe_access_token, expiresAt };
  }

  const refreshToken = secrets.stripe_refresh_token;
  if (!refreshToken) {
    console.error(`[stripe-resolver] hotel=${hotelId} oauth without refresh token`);
    return null;
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    await persistTokens(supabase, hotelId, tokens);
    console.log(`[stripe-resolver] hotel=${hotelId} token refreshed`);
    return { token: tokens.accessToken, expiresAt: tokens.expiresAt };
  } catch (err) {
    if (err instanceof StripeOAuthError && err.code === "invalid_grant") {
      const fresh = await readVaultSecrets(supabase, hotelId);
      if (fresh?.stripe_access_token) {
        console.log(
          `[stripe-resolver] hotel=${hotelId} lost the refresh race, using the stored token`,
        );
        return {
          token: fresh.stripe_access_token,
          expiresAt: new Date(Date.now() + REFRESH_MARGIN_MS).toISOString(),
        };
      }
    }
    console.error(`[stripe-resolver] hotel=${hotelId} token refresh failed:`, err);
    return null;
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
          new Date(access.expiresAt).getTime() - REFRESH_MARGIN_MS,
        );
      }

      console.warn(
        `[stripe-resolver] hotel=${hotelId} OAuth token unusable → falling back to global`,
      );
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
      console.warn(
        `[stripe-resolver] hotel=${hotelId} configured for stripe but Vault read failed → falling back to global`,
      );
    }
  }

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
