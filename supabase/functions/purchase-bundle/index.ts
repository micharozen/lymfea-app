import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Confirms a bundle purchase after Stripe payment.
 * Called from the Confirmation page with the Stripe session_id.
 *
 * 1. Retrieves the Stripe Checkout Session
 * 2. Validates payment status
 * 3. Creates customer via find_or_create_customer RPC
 * 4. Creates customer_treatment_bundles entries (no booking)
 * 5. Returns bundle details for confirmation display
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      throw new Error("Missing session ID");
    }

    // --- Retrieve Stripe session ---
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    // Check this is a bundle purchase
    if (session.metadata?.type !== 'bundle_purchase') {
      throw new Error("Invalid session type");
    }

    // Prevent double-processing: check if bundles already created for this session
    const { data: existingBundles } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id')
      .eq('payment_reference', `stripe:${sessionId}`)
      .limit(1);

    if (existingBundles && existingBundles.length > 0) {
      // Already processed — return existing bundle IDs
      const { data: allBundles } = await supabaseAdmin
        .from('customer_treatment_bundles')
        .select('id, bundle_id, total_sessions, expires_at, treatment_bundles(name, name_en)')
        .eq('payment_reference', `stripe:${sessionId}`);

      return new Response(
        JSON.stringify({
          success: true,
          alreadyProcessed: true,
          customerBundles: allBundles,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const {
      hotelId,
      firstName,
      lastName,
      clientEmail,
      phone,
      bundleItems: bundleItemsJson,
    } = session.metadata!;

    const bundleItems = JSON.parse(bundleItemsJson);

    // --- Find or create customer ---
    const { data: customerId, error: customerError } = await supabaseAdmin.rpc('find_or_create_customer', {
      _phone: phone,
      _first_name: firstName,
      _last_name: lastName,
      _email: clientEmail,
    });

    if (customerError) {
      console.error('[PURCHASE-BUNDLE] Error finding/creating customer:', customerError);
      throw new Error("Failed to create customer record");
    }

    // --- Create customer bundles ---
    const createdBundles: { id: string; bundleId: string }[] = [];

    for (const item of bundleItems) {
      const qty = item.quantity || 1;
      for (let i = 0; i < qty; i++) {
        const { data: customerBundleId, error: createError } = await supabaseAdmin.rpc('create_customer_bundle', {
          _customer_id: customerId,
          _bundle_id: item.bundleId,
          _hotel_id: hotelId,
          _booking_id: null,
        });

        if (createError) {
          console.error('[PURCHASE-BUNDLE] Failed to create customer bundle:', createError.message);
          throw new Error(`Failed to create bundle: ${createError.message}`);
        }

        // Tag with stripe session for idempotency
        await supabaseAdmin
          .from('customer_treatment_bundles')
          .update({ payment_reference: `stripe:${sessionId}` })
          .eq('id', customerBundleId);

        createdBundles.push({ id: customerBundleId, bundleId: item.bundleId });
      }
    }

    // --- Fetch bundle details for confirmation ---
    const bundleDetailIds = createdBundles.map(b => b.id);
    const { data: bundleDetails } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id, bundle_id, total_sessions, expires_at, treatment_bundles(name, name_en)')
      .in('id', bundleDetailIds);

    // --- Send confirmation email (future: dedicated bundle email template) ---
    try {
      await supabaseAdmin.functions.invoke('send-booking-confirmation', {
        body: {
          type: 'bundle_purchase',
          email: clientEmail,
          firstName,
          lastName,
          hotelId,
          bundles: bundleDetails,
        },
      });
    } catch (emailError) {
      console.error('[PURCHASE-BUNDLE] Email sending failed (non-blocking):', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        customerBundles: bundleDetails,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PURCHASE-BUNDLE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
