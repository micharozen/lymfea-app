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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    return jsonResponse({ error: "Missing 'action' in body" }, 400);
  }

  const handler = actions[action];
  if (!handler) {
    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }

  const hotelId =
    typeof body.hotelId === "string" && body.hotelId
      ? body.hotelId
      : null;

  let stripe;
  let accountId: string | null = null;
  try {
    const resolved = await getStripeForVenue(supabaseAdmin, hotelId);
    stripe = resolved.client;
    accountId = resolved.accountId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe init failed";
    console.error(`[stripe-payment] resolver error for action=${action}:`, message);
    return jsonResponse({ error: message }, 500);
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
    return jsonResponse({ error: message }, 500);
  }
});
