import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CONNECT] ${step}${detailsStr}`);
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
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get therapist profile
    const { data: therapist, error: therapistError } = await supabaseClient
      .from("therapists")
      .select("id, first_name, last_name, email, stripe_account_id")
      .eq("user_id", user.id)
      .single();

    if (therapistError || !therapist) {
      throw new Error("Therapist profile not found");
    }
    logStep("Therapist found", { therapistId: therapist.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

    let stripeAccountId = therapist.stripe_account_id;

    // Create Stripe Connect account if doesn't exist
    if (!stripeAccountId) {
      logStep("Creating new Stripe Connect account");
      
      const account = await stripe.accounts.create({
        type: "express",
        email: therapist.email,
        metadata: {
          therapist_id: therapist.id,
          user_id: user.id,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });

      stripeAccountId = account.id;
      logStep("Stripe account created", { accountId: stripeAccountId });

      // Save to database
      const { error: updateError } = await supabaseClient
        .from("therapists")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", therapist.id);

      if (updateError) {
        logStep("Error saving stripe_account_id", { error: updateError });
        throw new Error("Failed to save Stripe account ID");
      }
      logStep("Stripe account ID saved to database");
    } else {
      logStep("Using existing Stripe account", { accountId: stripeAccountId });
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://lovable.dev";
    
    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/pwa/stripe-callback?refresh=true`,
      return_url: `${origin}/pwa/stripe-callback?success=true`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { url: accountLink.url });

    return new Response(
      JSON.stringify({ 
        url: accountLink.url,
        stripeAccountId 
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
