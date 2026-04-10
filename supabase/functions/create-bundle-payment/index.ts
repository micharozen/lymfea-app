import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hotelId, clientData, bundleItems, totalPrice } = await req.json();

    // --- Validation ---
    if (!hotelId || !clientData || !bundleItems || !Array.isArray(bundleItems) || bundleItems.length === 0) {
      throw new Error("Missing required data");
    }
    if (!clientData.firstName || !clientData.lastName || !clientData.phone || !clientData.email) {
      throw new Error("Missing required client information");
    }

    // --- Verify bundle prices server-side ---
    const bundleIds = bundleItems.map((b: { bundleId: string }) => b.bundleId).filter(Boolean);
    if (bundleIds.length === 0) {
      throw new Error("No valid bundle IDs provided");
    }

    const { data: bundles, error: bundlesError } = await supabaseAdmin
      .from('treatment_bundles')
      .select('id, name, name_en, price, currency, total_sessions, validity_days, status, hotel_id')
      .in('id', bundleIds);

    if (bundlesError || !bundles || bundles.length === 0) {
      throw new Error("Failed to fetch valid bundles");
    }

    const invalidBundles = bundles.filter(b => b.status !== 'active' || (b.hotel_id !== null && b.hotel_id !== hotelId));
    if (invalidBundles.length > 0) {
      throw new Error("Some bundles are not available for this hotel");
    }

    // Calculate verified total
    const bundleMap = new Map(bundles.map(b => [b.id, b]));
    let verifiedTotal = 0;
    const lineItems: { price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number }[] = [];

    for (const item of bundleItems) {
      const bundle = bundleMap.get(item.bundleId);
      if (!bundle) throw new Error(`Bundle ${item.bundleId} not found`);
      const qty = item.quantity || 1;
      verifiedTotal += (bundle.price || 0) * qty;
      lineItems.push({
        price_data: {
          currency: (bundle.currency || 'eur').toLowerCase(),
          product_data: {
            name: `${bundle.name} (${bundle.total_sessions} séances)`,
          },
          unit_amount: Math.round((bundle.price || 0) * 100),
        },
        quantity: qty,
      });
    }

    if (verifiedTotal <= 0) {
      throw new Error("Invalid total price");
    }

    // --- Hotel info ---
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .select('currency, name')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError || !hotel) {
      throw new Error("Hotel not found");
    }

    // --- Stripe customer upsert ---
    let stripeCustomerId: string;
    const existingCustomers = await stripe.customers.list({ email: clientData.email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      stripeCustomerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: clientData.email,
        name: `${clientData.firstName} ${clientData.lastName}`,
        phone: clientData.phone,
      });
      stripeCustomerId = newCustomer.id;
    }

    // Upsert customer in our DB
    await supabaseAdmin
      .from('customers')
      .upsert({
        phone: clientData.phone,
        email: clientData.email,
        first_name: clientData.firstName,
        last_name: clientData.lastName,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: 'phone' });

    // --- Create Stripe Checkout Session (payment mode) ---
    const origin = req.headers.get("origin") || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${origin}/client/${hotelId}/confirmation/bundle?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/client/${hotelId}/payment`,
      metadata: {
        type: 'bundle_purchase',
        hotelId,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        clientEmail: clientData.email,
        phone: clientData.phone,
        roomNumber: clientData.roomNumber || '',
        note: clientData.note || '',
        bundleItems: JSON.stringify(bundleItems),
      },
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-BUNDLE-PAYMENT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
