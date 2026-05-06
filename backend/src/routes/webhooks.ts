import { Hono } from "hono";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { supabaseAdmin } from "../lib/supabase";
import { getStripeForVenue, getGlobalStripe } from "../lib/stripe-resolver";

/**
 * Stripe webhook routes — no auth (verified via Stripe signature).
 *
 * Migrated from: supabase/functions/stripe-webhook/index.ts
 *
 * Per-venue webhook routing: each venue configures their endpoint URL
 * with `?hotel_id=<uuid>` in their Stripe Dashboard. We resolve the
 * matching Stripe client + webhook secret from Vault. Bookings made on
 * the platform's global Stripe account fall back to STRIPE_WEBHOOK_SECRET
 * if it exists (legacy).
 *
 * MIGRATION NOTE:
 * The full event handlers (checkout.session.completed, invoice.payment_succeeded,
 * payment failures) are still skeletons — the bulk of the original handler
 * logic from supabase/functions/stripe-webhook/index.ts (~500 lines) needs
 * to be ported. The per-venue signature verification below already matches
 * the original behavior.
 */
const webhooks = new Hono();

webhooks.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "No signature" }, 400);
  }

  // Per-venue webhook routing via ?hotel_id=<uuid> query param.
  const hotelIdParam = c.req.query("hotel_id") || null;

  let stripeClient: Stripe;
  let webhookSecret: string | null;

  if (hotelIdParam) {
    const resolved = await getStripeForVenue(supabaseAdmin, hotelIdParam);
    stripeClient = resolved.client;
    webhookSecret = resolved.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;
  } else {
    // Legacy fallback for events posted to the global endpoint (no hotel_id).
    // Will throw at this point if neither STRIPE_SECRET_KEY nor a venue key
    // is configured — which is the desired behavior (no silent acceptance).
    try {
      stripeClient = getGlobalStripe().client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe not configured";
      console.error(`[stripe-webhook] No global Stripe client: ${msg}`);
      return c.json({ error: "Webhook endpoint requires ?hotel_id=<uuid> when no global Stripe key is configured" }, 400);
    }
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? null;
  }

  if (!webhookSecret) {
    console.error(`[stripe-webhook] No webhook secret for hotel_id=${hotelIdParam ?? "<none>"}`);
    return c.json({ error: "Webhook secret not configured" }, 400);
  }

  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripeClient.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return c.json({ error: message }, 400);
  }

  console.log(`[stripe-webhook] Event: ${event.type} (hotel=${hotelIdParam ?? "global"})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object);
        break;

      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event);
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", message);
    return c.json({ error: message }, 400);
  }
});

const logConnectStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CONNECT-WEBHOOK] ${step}${detailsStr}`);
};

webhooks.post("/stripe-connect", async (c) => {
  logConnectStep("Webhook received");

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logConnectStep("Webhook signature verified");
    } catch (err) {
      logConnectStep("Webhook signature verification failed", { error: err });
      return c.json({ error: "Webhook signature verification failed" }, 400);
    }
  } else {
    event = JSON.parse(body);
    logConnectStep("Webhook parsed without signature verification (no secret configured)");
  }

  logConnectStep("Event received", { type: event.type, id: event.id });

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    logConnectStep("Account updated event", {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });

    const isOnboardingComplete = account.details_submitted &&
                                  (account.charges_enabled || account.payouts_enabled);

    if (isOnboardingComplete) {
      logConnectStep("Onboarding appears complete, updating database");

      const { data: therapist, error: findError } = await supabaseAdmin
        .from("therapists")
        .select("id")
        .eq("stripe_account_id", account.id)
        .single();

      if (findError || !therapist) {
        logConnectStep("Therapist not found for Stripe account", { stripeAccountId: account.id });
      } else {
        const { error: updateError } = await supabaseAdmin
          .from("therapists")
          .update({ stripe_onboarding_completed: true })
          .eq("id", therapist.id);

        if (updateError) {
          logConnectStep("Error updating onboarding status", { error: updateError });
        } else {
          logConnectStep("Onboarding status updated to complete", { therapistId: therapist.id });
        }
      }
    }
  }

  if (event.type.startsWith("v2.")) {
    logConnectStep("V2 Event received (logging only)", { type: event.type });
  }

  return c.json({ received: true });
});

// ─── Handler Functions ──────────────────────────────────────────
// These replace the `supabase.functions.invoke(...)` pattern.
// Instead of calling another Edge Function over HTTP, we call directly.

async function handleCheckoutCompleted(session: any) {
  const metadata = session.metadata;

  if (session.mode === "payment" && session.payment_status === "paid") {
    const bookingId = metadata?.booking_id;
    if (!bookingId) {
      console.log("[stripe-webhook] No booking_id in metadata, skipping");
      return;
    }

    // Update payment status
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);

    if (error) {
      console.error("[stripe-webhook] Failed to update booking:", error);
      throw error;
    }

    console.log(`[stripe-webhook] Booking ${bookingId} marked as paid`);

    // Instead of supabase.functions.invoke('send-booking-confirmation'),
    // call the notification service directly:
    // await sendBookingConfirmation({ bookingId, ... });
    // await notifyAdminNewBooking({ bookingId });

    // TODO: Port the full notification chain from stripe-webhook edge function
  }
}

async function handleInvoicePaid(invoice: any) {
  console.log(`[stripe-webhook] Invoice paid: ${invoice.id}`);
  // TODO: Port from supabase/functions/stripe-webhook/index.ts
  // Lines 389-521 of the original
}

async function handlePaymentFailed(event: any) {
  console.log(`[stripe-webhook] Payment failed: ${event.type}`);
  // TODO: Port from supabase/functions/stripe-webhook/index.ts
  // Lines 525-722 of the original
}

export default webhooks;
