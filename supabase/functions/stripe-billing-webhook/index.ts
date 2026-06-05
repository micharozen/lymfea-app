// Stripe Billing webhook — handles subscription lifecycle events for the
// platform billing account. Strictly separate from stripe-webhook (Connect).
//
// Required env:
//   STRIPE_BILLING_SECRET_KEY      (signature verification needs the SDK)
//   STRIPE_BILLING_WEBHOOK_SECRET  (whsec_*)
//
// Registered with verify_jwt = false (public endpoint, signed payload).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  getBillingStripe,
  getBillingWebhookSecret,
  getPlanByPriceId,
} from "../_shared/stripe-billing.ts";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toIsoFromUnix(ts: number | null | undefined): string | null {
  if (!ts || ts <= 0) return null;
  return new Date(ts * 1000).toISOString();
}

async function syncSubscription(
  sub: Stripe.Subscription,
  organizationIdHint: string | null,
): Promise<void> {
  const organizationId =
    organizationIdHint ??
    (sub.metadata?.organization_id as string | undefined) ??
    null;

  if (!organizationId) {
    console.warn(
      `[stripe-billing-webhook] subscription ${sub.id} has no organization_id metadata; skipping`,
    );
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;

  // Stripe API >= 2025-08-27.basil moved period dates from the subscription
  // level to the subscription item level. Fall back to item.current_period_*
  // when the top-level fields are undefined.
  const itemAny = item as unknown as {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  const periodStart =
    sub.current_period_start ?? itemAny.current_period_start ?? null;
  const periodEnd =
    sub.current_period_end ?? itemAny.current_period_end ?? null;
  let planId: string | null = null;
  let billingCycle: "monthly" | "yearly" | null = null;

  if (priceId) {
    const resolved = await getPlanByPriceId(supabaseAdmin, priceId);
    if (resolved) {
      planId = resolved.plan.id;
      billingCycle = resolved.cycle;
    }
  }

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const defaultPm =
    typeof sub.default_payment_method === "string"
      ? sub.default_payment_method
      : sub.default_payment_method?.id ?? null;

  await supabaseAdmin.from("subscriptions").upsert(
    {
      organization_id: organizationId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_subscription_item_id: item?.id ?? null,
      plan_id: planId,
      status: sub.status,
      billing_cycle: billingCycle,
      seats: item?.quantity ?? 1,
      current_period_start: toIsoFromUnix(periodStart),
      current_period_end: toIsoFromUnix(periodEnd),
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      canceled_at: toIsoFromUnix(sub.canceled_at),
      trial_end: toIsoFromUnix(sub.trial_end),
      default_payment_method: defaultPm,
    },
    { onConflict: "organization_id" },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createLogger({ function: "stripe-billing-webhook", req });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    log.warn("signature.missing");
    await log.flush();
    return jsonResponse({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getBillingStripe();
    const secret = getBillingWebhookSecret();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
    );
  } catch (err) {
    log.error("signature.invalid", err);
    await log.flush();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Invalid signature" },
      400,
    );
  }

  log.bind({ event_id: event.id, event_type: event.type });

  // Idempotency: insert by event_id; on conflict skip.
  const { error: insertErr } = await supabaseAdmin
    .from("billing_webhook_events")
    .insert({
      event_id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertErr) {
    // Postgres unique violation = 23505 → event already processed.
    if (insertErr.code === "23505") {
      log.info("event.duplicate_skipped");
      await log.flush();
      return jsonResponse({ received: true, duplicate: true });
    }
    log.error("event.persist_failed", insertErr);
    // Don't fail Stripe with 5xx for log table errors — process anyway.
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId =
          (session.client_reference_id as string | null) ??
          ((session.metadata?.organization_id as string | undefined) ?? null);
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        if (subscriptionId) {
          const stripe = getBillingStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(sub, orgId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub, null);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (customerId) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ latest_invoice_id: inv.id })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "invoice.payment_failed": {
        // Subscription will move to past_due via subscription.updated; nothing
        // to do here beyond logging. Hook up an internal email later.
        log.warn("invoice.payment_failed");
        break;
      }
      default:
        log.info("event.unhandled");
    }
  } catch (err) {
    log.error("event.handler_failed", err);
    await log.flush();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Handler failed" },
      500,
    );
  }

  await log.flush();
  return jsonResponse({ received: true });
});
