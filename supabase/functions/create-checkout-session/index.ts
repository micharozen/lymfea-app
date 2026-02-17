import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CREATE-CHECKOUT] Starting checkout session creation");

    const { bookingData, clientData, treatmentIds, hotelId } = await req.json();

    // Validate required fields
    if (!bookingData || !clientData || !treatmentIds || !hotelId) {
      throw new Error("Missing required data");
    }

    if (!Array.isArray(treatmentIds) || treatmentIds.length === 0) {
      throw new Error("At least one treatment is required");
    }

    // Validate client data
    if (!clientData.firstName || !clientData.lastName || !clientData.phone) {
      throw new Error("Missing required client information");
    }

    console.log("[CREATE-CHECKOUT] Data received:", { 
      hotelId, 
      treatmentIds,
      clientName: `${clientData.firstName} ${clientData.lastName}`
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // SECURITY: Fetch treatments from database to get verified prices
    const { data: treatments, error: treatmentsError } = await supabase
      .from('treatment_menus')
      .select('id, name, price, hotel_id, status')
      .in('id', treatmentIds);

    if (treatmentsError) {
      console.error("[CREATE-CHECKOUT] Treatments fetch error:", treatmentsError);
      throw new Error("Failed to fetch treatments");
    }

    if (!treatments || treatments.length === 0) {
      throw new Error("No valid treatments found");
    }

    // SECURITY: Validate all treatments belong to the specified hotel and are active
    const invalidTreatments = treatments.filter(t => 
      (t.hotel_id !== null && t.hotel_id !== hotelId) || t.status !== 'active'
    );

    if (invalidTreatments.length > 0) {
      console.error("[CREATE-CHECKOUT] Invalid treatments detected:", invalidTreatments);
      throw new Error("Some treatments are not available for this hotel");
    }

    // SECURITY: Calculate total price server-side from verified database prices
    const verifiedTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);

    if (verifiedTotalPrice <= 0) {
      throw new Error("Invalid total price calculated");
    }

    console.log("[CREATE-CHECKOUT] Verified total price:", verifiedTotalPrice);

    // Fetch hotel info for currency
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('currency, name, offert')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError) {
      console.error("[CREATE-CHECKOUT] Hotel fetch error:", hotelError);
      throw hotelError;
    }

    if (!hotel) {
      throw new Error("Hotel not found");
    }

    // Block Stripe checkout for offert venues
    if (hotel.offert) {
      return new Response(
        JSON.stringify({ error: "Ce lieu propose actuellement des soins offerts. Utilisez la réservation directe." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const currency = hotel?.currency?.toLowerCase() || 'eur';
    console.log("[CREATE-CHECKOUT] Currency:", currency);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Create treatment description for Stripe
    const treatmentNames = treatments.map(t => t.name).join(', ');

    // Validate email format before passing to Stripe
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmail = clientData.email && emailRegex.test(clientData.email) ? clientData.email : undefined;

    // Create Stripe Checkout session with verified server-side price
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: validEmail,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Prestations coiffure',
              description: `${treatmentNames} - ${clientData.firstName} ${clientData.lastName}`,
            },
            unit_amount: Math.round(verifiedTotalPrice * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/client/${hotelId}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/client/${hotelId}/payment`,
      metadata: {
        hotel_id: hotelId,
        site_url: req.headers.get("origin") || "",
        client_first_name: clientData.firstName,
        client_last_name: clientData.lastName,
        client_email: clientData.email || '',
        client_phone: clientData.phone,
        room_number: clientData.roomNumber || '',
        client_note: clientData.note || '',
        booking_date: bookingData.date,
        booking_time: bookingData.time,
        treatment_ids: JSON.stringify(treatmentIds),
        verified_total_price: verifiedTotalPrice.toString(),
      },
    });

    console.log("[CREATE-CHECKOUT] Session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CHECKOUT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
