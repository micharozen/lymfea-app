import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import {
  buildPaymentConfig,
  getPaymentProvider,
  type PaymentProviderType,
} from "../_shared/payment-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
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

    const rpcName =
      provider === "stripe" ? "get_payment_stripe_secrets" : "get_payment_adyen_secrets";
    const { data: secrets, error: secretsError } = await supabase.rpc(rpcName, {
      p_hotel_id: hotelId,
    });

    if (secretsError) {
      console.error("[payment-test-connection] Failed to read Vault secrets:", secretsError);
      return new Response(
        JSON.stringify({ connected: false, error: "Failed to read credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const config = buildPaymentConfig(provider, paymentConfig, secrets as Record<string, any> | null);
    const client = getPaymentProvider(provider, config);
    console.log("[payment-test-connection] Config:", config);
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
