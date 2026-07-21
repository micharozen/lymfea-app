// Crée les Prices Stripe du passage au forfait mensuel (Starter 110 € / Pro 159 €).
//
// Ce script est le prérequis de `seed-billing-plans.ts` : il crée les Prices,
// le seed les synchronise ensuite dans public.plans.
//
// Run with:
//   deno run --allow-net --allow-env --env-file=.env.local scripts/create-billing-prices.ts
//   deno run ... scripts/create-billing-prices.ts --apply     (sans --apply : dry-run)
//
// Requires env:
//   STRIPE_BILLING_SECRET_KEY   secret de l'account billing (jamais en dur ici)
//
// Idempotent : si un Price actif au même montant / même intervalle existe déjà
// sur le produit, il est réutilisé au lieu d'en créer un second.
//
// N.B. Les abonnements en cours ne sont PAS migrés : ils restent sur leur Price
// d'origine (149 € / 249 €) jusqu'à une migration explicite. Les anciens Prices
// ne sont donc pas désactivés.

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  args: string[];
  exit: (code?: number) => never;
};

import Stripe from "https://esm.sh/stripe@18.5.0";

const stripeKey = Deno.env.get("STRIPE_BILLING_SECRET_KEY");
if (!stripeKey) {
  throw new Error(
    "STRIPE_BILLING_SECRET_KEY missing — exportez-la ou passez --env-file=.env.local",
  );
}

const apply = Deno.args.includes("--apply");
const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

const CURRENCY = "eur";

/** Montants cibles, en centimes. L'annuel vaut 10 mois (2 mois offerts). */
const TARGET: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 11_000, yearly: 110_000 },
  pro: { monthly: 15_900, yearly: 159_000 },
};

type Interval = "month" | "year";

async function ensurePrice(
  productId: string,
  planCode: string,
  interval: Interval,
  unitAmount: number,
): Promise<string> {
  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const match = existing.data.find(
    (p) =>
      p.recurring?.interval === interval &&
      p.recurring?.interval_count === 1 &&
      p.unit_amount === unitAmount &&
      p.currency === CURRENCY,
  );

  if (match) {
    console.log(`  = ${planCode}/${interval} déjà présent : ${match.id}`);
    return match.id;
  }

  if (!apply) {
    console.log(
      `  + ${planCode}/${interval} À CRÉER : ${unitAmount / 100} € (dry-run)`,
    );
    return "(dry-run)";
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: unitAmount,
    recurring: { interval, interval_count: 1 },
    metadata: { plan_code: planCode },
  });
  console.log(`  + ${planCode}/${interval} créé : ${created.id}`);
  return created.id;
}

async function main() {
  console.log(
    apply
      ? "Mode APPLY — les Prices manquants seront créés."
      : "Mode DRY-RUN — aucun Price ne sera créé. Relancer avec --apply.",
  );

  const products = await stripe.products.list({ active: true, limit: 100 });
  let touched = 0;

  for (const product of products.data) {
    const code = product.metadata?.plan_code;
    if (!code || !(code in TARGET)) continue;

    touched++;
    console.log(`\n${code} → produit ${product.id} (${product.name})`);
    await ensurePrice(product.id, code, "month", TARGET[code].monthly);
    await ensurePrice(product.id, code, "year", TARGET[code].yearly);
  }

  if (touched === 0) {
    console.error(
      "\n! Aucun produit avec metadata.plan_code = 'starter' | 'pro'. Rien à faire.",
    );
    Deno.exit(1);
  }

  console.log(
    apply
      ? "\nTerminé. Enchaîner sur : deno run --allow-net --allow-env --env-file=.env.local scripts/seed-billing-plans.ts"
      : "\nDry-run terminé. Relancer avec --apply pour créer.",
  );
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
