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

    const { bookingData, clientData, treatments, totalPrice, hotelId } = await req.json();

    if (!bookingData || !clientData || !treatments || !totalPrice || !hotelId) {
      throw new Error("Missing required data");
    }

    console.log("[CREATE-CHECKOUT] Data received:", { 
      hotelId, 
      totalPrice, 
      treatmentsCount: treatments.length 
    });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Récupérer les infos de l'hôtel pour la devise
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('currency')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError) {
      console.error("[CREATE-CHECKOUT] Hotel fetch error:", hotelError);
      throw hotelError;
    }

    const currency = hotel?.currency?.toLowerCase() || 'eur';
    console.log("[CREATE-CHECKOUT] Currency:", currency);

    // Créer une session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: clientData.email,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Prestations coiffure',
              description: `Réservation pour ${clientData.firstName} ${clientData.lastName}`,
            },
            unit_amount: Math.round(totalPrice * 100), // Stripe utilise les centimes
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/client/${hotelId}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/client/${hotelId}/payment`,
      metadata: {
        hotel_id: hotelId,
        client_first_name: clientData.firstName,
        client_last_name: clientData.lastName,
        client_email: clientData.email,
        client_phone: clientData.phone,
        room_number: clientData.roomNumber || '',
        client_note: clientData.note || '',
        booking_date: bookingData.date,
        booking_time: bookingData.time,
        treatments: JSON.stringify(treatments),
        total_price: totalPrice.toString(),
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
