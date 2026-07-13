// Consolidated Stripe edge function — routes one of N actions to the right
// handler. Each handler receives a context with a Stripe client resolved
// per-venue via _shared/stripe-resolver.ts (Vault-backed credentials, with
// fallback to the global STRIPE_SECRET_KEY).
//
// Usage from frontend:
//   await supabase.functions.invoke('stripe-payment', {
//     body: { action: 'create-setup-intent', hotelId, ...payload }
//   })

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import { createLogger } from "../_shared/logger.ts";

import { handleCreateSetupIntent } from "./actions/createSetupIntent.ts";
import { handleConfirmSetupIntent } from "./actions/confirmSetupIntent.ts";
import { handleChargeSavedCard } from "./actions/chargeSavedCard.ts";
import { handleCreateBundlePayment } from "./actions/createBundlePayment.ts";
import { handlePurchaseBundle } from "./actions/purchaseBundle.ts";
import { handleCreateCheckoutSession } from "./actions/createCheckoutSession.ts";
import { handleHandleCheckoutSuccess } from "./actions/handleCheckoutSuccess.ts";
import { handleFinalizePayment } from "./actions/finalizePayment.ts";
import { handleSendPaymentLink } from "./actions/sendPaymentLink.ts";
import { handleCheckExpiredPaymentLinks } from "./actions/checkExpiredPaymentLinks.ts";
import { handleRefund } from "./actions/refund.ts";

export interface ActionContext {
  req: Request;
  body: Record<string, unknown>;
  supabase: SupabaseClient;
  stripe: Stripe;
  stripeAccountId: string | null;
  hotelId: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ActionHandler = (ctx: ActionContext) => Promise<Response>;

// Some actions can derive hotelId from a Stripe session metadata after a
// preliminary retrieve. They are responsible for re-resolving the client
// internally if needed; the router does its best to pass a venue client up
// front when hotelId is in the body.
const actions: Record<string, ActionHandler> = {
  "create-setup-intent": handleCreateSetupIntent,
  "confirm-setup-intent": handleConfirmSetupIntent,
  "charge-saved-card": handleChargeSavedCard,
  "create-bundle-payment": handleCreateBundlePayment,
  "purchase-bundle": handlePurchaseBundle,
  "create-checkout-session": handleCreateCheckoutSession,
  "handle-checkout-success": handleHandleCheckoutSuccess,
  "finalize-payment": handleFinalizePayment,
  "send-payment-link": handleSendPaymentLink,
  "check-expired-payment-links": handleCheckExpiredPaymentLinks,
  "refund": handleRefund,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createLogger({ function: "stripe-payment", req });

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    log.warn("request.invalid_json");
    await log.flush();
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    await log.flush();
    return jsonResponse({ error: "Missing 'action' in body" }, 400);
  }

  const handler = actions[action];
  if (!handler) {
    log.warn("action.unknown", { action });
    await log.flush();
    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }

  let hotelId =
    typeof body.hotelId === "string" && body.hotelId
      ? body.hotelId
      : null;

  // Derive hotelId from bookingId when the caller didn't pass it explicitly.
  // Frontends that only have a booking reference (e.g. PaymentLinkForm) rely
  // on this so getStripeForVenue picks the venue's Stripe key instead of
  // falling back to the missing global STRIPE_SECRET_KEY.
  const bookingIdForLookup =
    (typeof body.bookingId === "string" && body.bookingId) ||
    (typeof body.booking_id === "string" && body.booking_id) ||
    null;

  if (!hotelId && bookingIdForLookup) {
    const { data: bookingRow } = await supabaseAdmin
      .from("bookings")
      .select("hotel_id")
      .eq("id", bookingIdForLookup)
      .maybeSingle();
    if (bookingRow?.hotel_id) {
      hotelId = bookingRow.hotel_id;
    }
  }

  log.bind({ action, hotelId });

  // Cross-venue actions (cron jobs) have no single hotelId up front and
  // resolve the right Stripe client per booking inside their handler.
  // For those, a missing global key must NOT be fatal.
  const SELF_RESOLVING_ACTIONS = new Set(["check-expired-payment-links"]);

  let stripe = null as unknown as Stripe;
  let accountId: string | null = null;
  try {
    const resolved = await getStripeForVenue(supabaseAdmin, hotelId);
    stripe = resolved.client;
    accountId = resolved.accountId;
  } catch (err) {
    if (!SELF_RESOLVING_ACTIONS.has(action)) {
      const message = err instanceof Error ? err.message : "Stripe init failed";
      console.error(`[stripe-payment] resolver error for action=${action}:`, message);
      log.error("stripe.resolver_failed", err);
      await log.flush();
      return jsonResponse({ error: message }, 500);
    }
    console.warn(
      `[stripe-payment] no upfront Stripe client for action=${action} (resolves per venue)`,
    );
  }

  try {
    return await handler({
      req,
      body,
      supabase: supabaseAdmin,
      stripe,
      stripeAccountId: accountId,
      hotelId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-payment] action=${action} error:`, message);
    // Stripe declines surface here for charge-saved-card and purchase-bundle.
    const errAny = err as { type?: string; code?: string; decline_code?: string };
    log.error("payment.action_failed", err, {
      stripe_error_type: errAny.type,
      stripe_error_code: errAny.code,
      stripe_decline_code: errAny.decline_code,
    });
    return jsonResponse({ error: message }, 500);
  } finally {
    await log.flush();
  }
});
