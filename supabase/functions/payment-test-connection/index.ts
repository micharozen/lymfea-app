import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Pinned to the same version as _shared/stripe-resolver.ts: the SupabaseClient
// generics differ across 2.4x/2.5x, so passing a client built here to the
// resolver only type-checks when both agree.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  buildPaymentConfig,
  getPaymentProvider,
  type PaymentProviderType,
} from "../_shared/payment-provider.ts";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { hotelId } = await req.json();

    if (!hotelId) {
      return new Response(
        JSON.stringify({ connected: false, error: "hotelId is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    console.log("[payment-test-connection] Testing for hotel:", hotelId);

    const { data: paymentConfig, error: configError } = await supabase
      .from("hotel_payment_configs")
      .select("provider, adyen_environment")
      .eq("hotel_id", hotelId)
      .single();

    if (configError || !paymentConfig) {
      console.error("[payment-test-connection] Payment config not found:", configError);
      return new Response(
        JSON.stringify({ connected: false, error: "Payment configuration not found for this hotel" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const provider = paymentConfig.provider as PaymentProviderType;
    if (provider !== "stripe" && provider !== "adyen") {
      return new Response(
        JSON.stringify({ connected: false, error: `Unsupported provider: ${provider}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Stripe goes through the resolver so an OAuth venue gets its access token
    // refreshed before we test it. The source guard keeps the test honest: the
    // resolver silently falls back to the platform key, which would otherwise
    // report "connected" for a venue whose own credential is broken.
    if (provider === "stripe") {
      const resolved = await getStripeForVenue(supabase, hotelId);

      let result: { connected: boolean; error?: string };
      if (resolved.source !== "venue") {
        result = {
          connected: false,
          error: "No working Stripe credential for this venue",
        };
      } else {
        try {
          await resolved.client.balance.retrieve();
          result = { connected: true };
        } catch (error) {
          result = {
            connected: false,
            error: error instanceof Error ? error.message : "Unknown Stripe error",
          };
        }
      }

      console.log(
        `[payment-test-connection] stripe auth=${resolved.authMethod ?? "none"} result=`,
        result,
      );

      await supabase
        .from("hotel_payment_configs")
        .update({
          connection_status: result.connected ? "connected" : "failed",
          connection_error: result.connected ? null : result.error ?? "Unknown error",
          ...(result.connected ? { connection_verified_at: new Date().toISOString() } : {}),
        })
        .eq("hotel_id", hotelId);

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Stripe returned above — only Adyen reaches this point.
    const { data: secrets, error: secretsError } = await supabase.rpc(
      "get_payment_adyen_secrets",
      { p_hotel_id: hotelId },
    );

    if (secretsError) {
      console.error("[payment-test-connection] Failed to read Vault secrets:", secretsError);
      return new Response(
        JSON.stringify({ connected: false, error: "Failed to read credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const config = buildPaymentConfig(provider, paymentConfig, secrets as Record<string, any> | null);
    const client = getPaymentProvider(provider, config);
    // Never log `config` — it carries the decrypted API key.
    const result = await client.testConnection();

    console.log("[payment-test-connection] Result:", result);

    await supabase
      .from("hotel_payment_configs")
      .update({
        connection_status: result.connected ? "connected" : "failed",
        connection_error: result.connected ? null : result.error || "Unknown error",
        ...(result.connected ? { connection_verified_at: new Date().toISOString() } : {}),
      })
      .eq("hotel_id", hotelId);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[payment-test-connection] Error:", error);
    return new Response(
      JSON.stringify({ connected: false, error: error.message || "Unexpected error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
