import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ONBOARDING-LINK-V2] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get hairdresser profile with stripe account
    const { data: hairdresser, error: hairdresserError } = await supabaseClient
      .from("hairdressers")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single();

    if (hairdresserError || !hairdresser) {
      throw new Error("Hairdresser profile not found");
    }

    if (!hairdresser.stripe_account_id) {
      throw new Error("No Stripe account found. Please create one first.");
    }

    logStep("Hairdresser found", { 
      hairdresserId: hairdresser.id, 
      stripeAccountId: hairdresser.stripe_account_id 
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://lovable.dev";
    
    // Create onboarding link using V2 compatible method
    const accountLink = await stripe.accountLinks.create({
      account: hairdresser.stripe_account_id,
      refresh_url: `${origin}/pwa/wallet?refresh=true`,
      return_url: `${origin}/pwa/wallet?success=true`,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
      },
    });

    logStep("Onboarding link created", { url: accountLink.url });

    return new Response(
      JSON.stringify({ 
        url: accountLink.url
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
