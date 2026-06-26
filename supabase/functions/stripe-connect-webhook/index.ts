import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CONNECT-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
    
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: err });
        return new Response(
          JSON.stringify({ error: "Webhook signature verification failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Parse without verification (dev mode)
      event = JSON.parse(body);
      logStep("Webhook parsed without signature verification (no secret configured)");
    }

    logStep("Event received", { type: event.type, id: event.id });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle account events
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      logStep("Account updated event", { 
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      });

      // Check if onboarding is complete
      const isOnboardingComplete = account.details_submitted && 
                                    (account.charges_enabled || account.payouts_enabled);

      if (isOnboardingComplete) {
        logStep("Onboarding appears complete, updating database");
        
        // Update therapist record
        const { data: therapist, error: findError } = await supabaseClient
          .from("therapists")
          .select("id")
          .eq("stripe_account_id", account.id)
          .single();

        if (findError || !therapist) {
          logStep("Therapist not found for Stripe account", { stripeAccountId: account.id });
        } else {
          const { error: updateError } = await supabaseClient
            .from("therapists")
            .update({ stripe_onboarding_completed: true })
            .eq("id", therapist.id);

          if (updateError) {
            logStep("Error updating onboarding status", { error: updateError });
          } else {
            logStep("Onboarding status updated to complete", { therapistId: therapist.id });
          }
        }
      }
    }

    // Handle V2 specific events (log for now)
    if (event.type.startsWith("v2.")) {
      logStep("V2 Event received (logging only)", { type: event.type });
    }

    return new Response(
      JSON.stringify({ received: true }),
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
