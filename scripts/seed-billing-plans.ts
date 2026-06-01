// Seed / sync plans rows with Stripe price IDs.
// This script runs under Deno (not Node/Vite) — declare the runtime globals
// locally so the project's tsconfig doesn't flag them.
declare const Deno: {
  env: { get: (key: string) => string | undefined };
  exit: (code?: number) => never;
};


// Run with:
//   deno run --allow-net --allow-env scripts/seed-billing-plans.ts
//
// Requires env (loaded via --env-file=.env.local or exported):
//   STRIPE_BILLING_SECRET_KEY      Stripe billing account secret
//   SUPABASE_URL  | VITE_SUPABASE_URL    Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY      service role key (NOT the publishable/anon
//                                   key — RLS would reject the plans writes)
//
// Expects each Stripe Product to have metadata.plan_code = 'starter' | 'pro',
// and two recurring Prices per product (one monthly, one yearly). The script
// is idempotent: it updates plans.stripe_product_id / stripe_price_id_* by
// matching on metadata.plan_code.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripeKey = Deno.env.get("STRIPE_BILLING_SECRET_KEY");
const supabaseUrl =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!stripeKey) throw new Error("STRIPE_BILLING_SECRET_KEY missing");
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) missing");
}
if (!serviceKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY missing — the publishable/anon key cannot bypass RLS on plans; copy the service_role key from Supabase dashboard → Project Settings → API",
  );
}

const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
const supabase = createClient(supabaseUrl, serviceKey);

const TARGET_CODES = new Set(["starter", "pro"]);

interface PriceByCycle {
  monthly?: { id: string; unit_amount: number };
  yearly?: { id: string; unit_amount: number };
}

async function main() {
  const products = await stripe.products.list({ active: true, limit: 100 });
  console.log(`Found ${products.data.length} active Stripe product(s)`);

  for (const product of products.data) {
    const code = product.metadata?.plan_code;
    if (!code || !TARGET_CODES.has(code)) {
      console.log(`- skip product ${product.id} (no matching plan_code)`);
      continue;
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 50,
    });

    const byCycle: PriceByCycle = {};
    for (const p of prices.data) {
      if (!p.recurring || p.unit_amount == null) continue;
      if (p.recurring.interval === "month" && p.recurring.interval_count === 1) {
        byCycle.monthly = { id: p.id, unit_amount: p.unit_amount };
      } else if (
        p.recurring.interval === "year" &&
        p.recurring.interval_count === 1
      ) {
        byCycle.yearly = { id: p.id, unit_amount: p.unit_amount };
      }
    }

    const update: Record<string, unknown> = {
      stripe_product_id: product.id,
    };
    if (byCycle.monthly) {
      update.stripe_price_id_monthly = byCycle.monthly.id;
      update.monthly_amount_cents = byCycle.monthly.unit_amount;
    }
    if (byCycle.yearly) {
      update.stripe_price_id_yearly = byCycle.yearly.id;
      update.yearly_amount_cents = byCycle.yearly.unit_amount;
    }

    const { error } = await supabase
      .from("plans")
      .update(update)
      .eq("code", code);
    if (error) {
      console.error(`! plan ${code} update failed:`, error.message);
      continue;
    }
    console.log(
      `✓ plan ${code} synced: product=${product.id} monthly=${byCycle.monthly?.id ?? "—"} yearly=${byCycle.yearly?.id ?? "—"}`,
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
