import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRIPE_API_VERSION = "2025-08-27.basil" as const;

export interface ResolvedStripe {
  client: Stripe;
  source: "venue" | "global";
  hotelId: string | null;
  accountId: string | null;
  webhookSecret: string | null;
}

const venueCache = new Map<string, ResolvedStripe>();
let globalCache: ResolvedStripe | null = null;

function buildStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
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
    hotelId: null,
    accountId: null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  };
  return globalCache;
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
  if (cached) return cached;

  const { data: cfg } = await supabase
    .from("hotel_payment_configs")
    .select("provider, stripe_account_id, stripe_vault_secret_id")
    .eq("hotel_id", hotelId)
    .maybeSingle();

  if (cfg?.provider === "stripe" && cfg.stripe_vault_secret_id) {
    const { data: secrets, error } = await supabase.rpc(
      "get_payment_stripe_secrets",
      { p_hotel_id: hotelId },
    );

    if (!error && secrets && typeof secrets === "object") {
      const payload = secrets as Record<string, string | null>;
      const key = payload.stripe_secret_key;
      if (key) {
        const resolved: ResolvedStripe = {
          client: buildStripe(key),
          source: "venue",
          hotelId,
          accountId: cfg.stripe_account_id ?? null,
          webhookSecret: payload.stripe_webhook_secret ?? null,
        };
        venueCache.set(hotelId, resolved);
        console.log(`[stripe-resolver] hotel=${hotelId} source=venue`);
        return resolved;
      }
    }
    console.warn(
      `[stripe-resolver] hotel=${hotelId} configured for stripe but Vault read failed → falling back to global`,
    );
  }

  const global = getGlobalStripe();
  const resolved: ResolvedStripe = {
    ...global,
    hotelId,
    accountId: cfg?.stripe_account_id ?? null,
  };
  venueCache.set(hotelId, resolved);
  console.log(`[stripe-resolver] hotel=${hotelId} source=global (no venue key)`);
  return resolved;
}

export function clearStripeResolverCache(hotelId?: string) {
  if (hotelId) venueCache.delete(hotelId);
  else {
    venueCache.clear();
    globalCache = null;
  }
}
