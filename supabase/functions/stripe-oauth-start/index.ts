// Kicks off the Stripe OAuth flow for a venue.
//
// Returns the Stripe authorize URL; the browser navigation is done client-side.
// A one-shot `state` row is created first so the callback can prove the
// round-trip came from us and belongs to this user + venue.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { buildAuthorizeUrl } from "../_shared/stripe-oauth.ts";
import { requireVenueAccess, VenueAuthzError } from "../_shared/venue-authz.ts";

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
    const { hotelId } = await req.json();
    if (!hotelId) return jsonResponse({ error: "hotelId is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { userId } = await requireVenueAccess(
      supabase,
      req.headers.get("Authorization"),
      hotelId,
    );

    const state = crypto.randomUUID();
    const { error: stateError } = await supabase
      .from("payment_oauth_states")
      .insert({ state, hotel_id: hotelId, user_id: userId });

    if (stateError) {
      console.error("[stripe-oauth-start] Failed to store state:", stateError);
      return jsonResponse({ error: "Failed to start the connection" }, 500);
    }

    // Throws (and 500s) if STRIPE_APP_CLIENT_ID or SITE_URL is missing — better
    // than sending Stripe a redirect_uri it will reject on exact match.
    const url = buildAuthorizeUrl(state);

    console.log(`[stripe-oauth-start] hotel=${hotelId} state issued`);
    return jsonResponse({ url });
  } catch (err) {
    if (err instanceof VenueAuthzError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[stripe-oauth-start] Error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
