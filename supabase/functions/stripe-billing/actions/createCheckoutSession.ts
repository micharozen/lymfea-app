import type { ActionContext } from "../index.ts";
import {
  type BillingCycle,
  getPlanByCode,
  pickPriceId,
} from "../../_shared/stripe-billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TRIAL_PERIOD_DAYS = 14;

interface PendingVenue {
  name: string;
  address: string;
  venue_type: "hotel" | "spa";
  postal_code?: string;
  city?: string;
  country?: string;
}

function trimStr(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function parsePendingVenue(raw: unknown): PendingVenue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = trimStr(r.name, 120);
  const address = trimStr(r.address, 200);
  const venueType =
    r.venue_type === "spa" ? "spa" : r.venue_type === "hotel" ? "hotel" : null;
  if (!name || !address || !venueType) return null;
  return {
    name,
    address,
    venue_type: venueType,
    postal_code: trimStr(r.postal_code, 20) || undefined,
    city: trimStr(r.city, 120) || undefined,
    country: trimStr(r.country, 120) || undefined,
  };
}

export async function handleCreateCheckoutSession(
  ctx: ActionContext,
): Promise<Response> {
  const planCode = String(ctx.body.plan_code ?? "");
  const billingCycle = String(ctx.body.billing_cycle ?? "monthly") as BillingCycle;
  const successUrl = String(ctx.body.success_url ?? "");
  const cancelUrl = String(ctx.body.cancel_url ?? "");
  const seats = Math.max(1, Number(ctx.body.seats ?? 1));
  const pendingVenue = parsePendingVenue(ctx.body.pending_venue);

  if (!planCode || !successUrl || !cancelUrl) {
    return json(
      { error: "plan_code, success_url and cancel_url are required" },
      400,
    );
  }
  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    return json({ error: "billing_cycle must be 'monthly' or 'yearly'" }, 400);
  }
  if (planCode === "enterprise") {
    return json({ error: "Enterprise plan is contact-sales only" }, 400);
  }

  const plan = await getPlanByCode(ctx.supabase, planCode);
  if (!plan) return json({ error: `Unknown plan: ${planCode}` }, 404);
  const priceId = pickPriceId(plan, billingCycle);

  // Fetch org + existing subscription (if any).
  const { data: org } = await ctx.supabase
    .from("organizations")
    .select("id, name, contact_email")
    .eq("id", ctx.organizationId)
    .maybeSingle();

  if (!org) return json({ error: "Organization not found" }, 404);

  const { data: existing } = await ctx.supabase
    .from("subscriptions")
    .select("id, stripe_customer_id, stripe_subscription_id, status")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  // Block if org already has a live subscription — they should use the portal.
  if (
    existing?.stripe_subscription_id &&
    existing.status &&
    !["canceled", "incomplete_expired"].includes(existing.status)
  ) {
    return json(
      {
        error:
          "Organization already has an active subscription. Use the billing portal to change plan.",
      },
      409,
    );
  }

  // Resolve or create Stripe Customer.
  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId || customerId.startsWith("manual:")) {
    const customer = await ctx.stripe.customers.create({
      name: org.name,
      email: org.contact_email ?? undefined,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;

    // Persist a stub row immediately so webhook upsert has something to update.
    await ctx.supabase
      .from("subscriptions")
      .upsert(
        {
          organization_id: org.id,
          stripe_customer_id: customerId,
          status: "incomplete",
          seats,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          ...(pendingVenue ? { metadata: { pending_venue: pendingVenue } } : {}),
        },
        { onConflict: "organization_id" },
      );
  } else if (pendingVenue) {
    // Existing subscription stub — merge pending_venue into metadata.
    const { data: current } = await ctx.supabase
      .from("subscriptions")
      .select("metadata")
      .eq("organization_id", org.id)
      .maybeSingle();
    const nextMetadata = {
      ...((current?.metadata as Record<string, unknown>) ?? {}),
      pending_venue: pendingVenue,
    };
    await ctx.supabase
      .from("subscriptions")
      .update({ metadata: nextMetadata })
      .eq("organization_id", org.id);
  }

  const session = await ctx.stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: seats }],
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: {
        organization_id: org.id,
        plan_id: plan.id,
        plan_code: plan.code,
        billing_cycle: billingCycle,
      },
    },
    client_reference_id: org.id,
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organization_id: org.id,
      plan_code: plan.code,
      billing_cycle: billingCycle,
    },
  });

  return json({ url: session.url, session_id: session.id });
}
