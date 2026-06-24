// Stripe Billing client resolver — strictly separate from stripe-resolver.ts
// (which handles Stripe Connect for therapist payouts).
//
// Billing uses its own Stripe account, with dedicated keys:
//   STRIPE_BILLING_SECRET_KEY   — sk_live / sk_test for the billing account
//   STRIPE_BILLING_WEBHOOK_SECRET — whsec_* for stripe-billing-webhook
//
// IMPORTANT: never import STRIPE_SECRET_KEY here, and never import
// STRIPE_BILLING_SECRET_KEY from stripe-resolver.ts.

import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const STRIPE_API_VERSION = "2025-08-27.basil" as const;

let cached: Stripe | null = null;

export function getBillingStripe(): Stripe {
  if (cached) return cached;
  const key = Deno.env.get("STRIPE_BILLING_SECRET_KEY") ?? "";
  if (!key) {
    throw new Error("STRIPE_BILLING_SECRET_KEY is not configured");
  }
  cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return cached;
}

export function getBillingWebhookSecret(): string {
  const secret = Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    throw new Error("STRIPE_BILLING_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

export type BillingCycle = "monthly" | "yearly";

export interface PlanRow {
  id: string;
  code: "starter" | "pro" | "enterprise";
  name: string;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  monthly_amount_cents: number | null;
  yearly_amount_cents: number | null;
  currency: string;
  features: string[];
  is_active: boolean;
}

export async function getPlanByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`plans lookup failed: ${error.message}`);
  return (data as PlanRow | null) ?? null;
}

export async function getPlanByPriceId(
  supabase: SupabaseClient,
  priceId: string,
): Promise<{ plan: PlanRow; cycle: BillingCycle } | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .or(
      `stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`,
    )
    .maybeSingle();
  if (error) throw new Error(`plans price lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as PlanRow;
  const cycle: BillingCycle =
    row.stripe_price_id_yearly === priceId ? "yearly" : "monthly";
  return { plan: row, cycle };
}

export function pickPriceId(plan: PlanRow, cycle: BillingCycle): string {
  const id =
    cycle === "yearly"
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly;
  if (!id) {
    throw new Error(
      `Plan ${plan.code} has no Stripe price for cycle=${cycle}. Run scripts/seed-billing-plans.ts.`,
    );
  }
  return id;
}
