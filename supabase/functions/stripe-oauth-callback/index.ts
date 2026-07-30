// Completes the Stripe OAuth flow for a venue.
//
// Called by the admin page /admin/stripe-oauth-callback (not by Stripe itself),
// so the caller is an authenticated admin/concierge and the authorization code
// never transits outside the browser → our own backend.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  exchangeCode,
  persistTokens,
  StripeOAuthError,
} from "../_shared/stripe-oauth.ts";
import { userIdFromAuthHeader, VenueAuthzError } from "../_shared/venue-authz.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, state } = await req.json();
    if (!code || !state) {
      return jsonResponse({ error: "code and state are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const callerId = userIdFromAuthHeader(req.headers.get("Authorization"));

    // One-shot: a replayed or forged state finds nothing.
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_payment_oauth_state",
      { p_state: state },
    );

    if (claimError) {
      console.error("[stripe-oauth-callback] state claim failed:", claimError);
      return jsonResponse({ error: "Failed to verify the request" }, 500);
    }

    const claim = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!claim?.hotel_id) {
      return jsonResponse(
        { error: "This connection link has expired or was already used" },
        400,
      );
    }

    if (claim.user_id !== callerId) {
      console.warn(
        `[stripe-oauth-callback] state user mismatch (state=${claim.user_id} caller=${callerId})`,
      );
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const hotelId: string = claim.hotel_id;
    const tokens = await exchangeCode(code);

    // No webhook to provision here: the Saoma app has a single endpoint
    // listening to every connected account, and stripe-webhook maps each event
    // back to a venue through `account: acct_…`. Which is why storing
    // stripe_account_id below is what actually wires up the events.
    await persistTokens(supabase, hotelId, tokens, { markConnected: true });

    await supabase
      .from("hotels")
      .update({ payment_provider: "stripe" })
      .eq("id", hotelId);

    console.log(
      `[stripe-oauth-callback] hotel=${hotelId} account=${tokens.accountId} livemode=${tokens.livemode}`,
    );

    return jsonResponse({
      success: true,
      hotelId,
      accountId: tokens.accountId,
      livemode: tokens.livemode,
    });
  } catch (err) {
    if (err instanceof VenueAuthzError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    if (err instanceof StripeOAuthError) {
      console.error("[stripe-oauth-callback] Stripe OAuth error:", err.message);
      return jsonResponse({ error: err.message }, 400);
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[stripe-oauth-callback] Error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
