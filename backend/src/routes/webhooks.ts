import { Hono } from "hono";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Stripe webhook routes — no auth (verified via Stripe signature).
 *
 * Migrated from: supabase/functions/stripe-webhook/index.ts
 *
 * MIGRATION NOTE:
 * The key difference: instead of `supabase.functions.invoke('other-function')`,
 * we import and call the handler directly. No more inter-function HTTP calls.
 *
 * This is a SKELETON showing the pattern. The full webhook handler from
 * `supabase/functions/stripe-webhook/index.ts` should be ported here
 * with the same logic — it's a direct translation.
 */
const webhooks = new Hono();

/**
 * Stripe Webhook handler.
 * Receives raw body for signature verification.
 */
webhooks.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "No signature" }, 400);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  // Hono gives access to the raw body for Stripe signature verification
  const body = await c.req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return c.json({ error: message }, 400);
  }

  console.log(`[stripe-webhook] Event: ${event.type}`);

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
