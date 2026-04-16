import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { checkAlmaEligibility } from "../_shared/alma-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { amount } = await req.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error("Missing or invalid amount");
    }

    const amountCents = Math.round(amount * 100);

    console.log(`[ALMA-ELIGIBILITY] Checking eligibility for ${amount}€ (${amountCents} cents)`);

    const results = await checkAlmaEligibility(amountCents);

    // Transform results into a simpler shape for the frontend
    const plans = results.map((r) => ({
      installmentsCount: r.installments_count,
      eligible: r.eligible,
      paymentPlan: r.eligible && r.payment_plan
        ? r.payment_plan.map((p) => ({
            amount: p.purchase_amount, // in cents
            customerFee: p.customer_fee,
            dueDate: p.due_date,
          }))
        : null,
      constraints: r.constraints ?? null,
    }));

    return new Response(
      JSON.stringify({ plans }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ALMA-ELIGIBILITY] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
