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
    console.log("[CHECKOUT-SUCCESS] Processing checkout success");

    const { sessionId } = await req.json();

    if (!sessionId) {
      throw new Error("Missing session ID");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Récupérer les détails de la session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    console.log("[CHECKOUT-SUCCESS] Payment confirmed for session:", sessionId);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Extraire les données de la metadata
    const metadata = session.metadata;
    const treatments = JSON.parse(metadata?.treatments || '[]');

    // Récupérer l'hôtel
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', metadata?.hotel_id)
      .maybeSingle();

    if (hotelError) {
      console.error("[CHECKOUT-SUCCESS] Hotel fetch error:", hotelError);
    }

    // Find available trunk for this booking
    const { data: trunks } = await supabase
      .from('trunks')
      .select('id')
      .eq('hotel_id', metadata?.hotel_id)
      .eq('status', 'active');

    let trunkId = null;
    if (trunks && trunks.length > 0) {
      // Get bookings at this time slot that have trunks assigned
      const { data: bookingsWithTrunks } = await supabase
        .from('bookings')
        .select('trunk_id')
        .eq('hotel_id', metadata?.hotel_id)
        .eq('booking_date', metadata?.booking_date)
        .eq('booking_time', metadata?.booking_time)
        .not('trunk_id', 'is', null)
        .not('status', 'in', '("Annulé","Terminé","cancelled")');

      const usedTrunkIds = new Set(bookingsWithTrunks?.map(b => b.trunk_id) || []);
      
      // Find first available trunk
      for (const trunk of trunks) {
        if (!usedTrunkIds.has(trunk.id)) {
          trunkId = trunk.id;
          break;
        }
      }
    }
    console.log("[CHECKOUT-SUCCESS] Assigned trunk:", trunkId);

    // Créer la réservation
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        hotel_id: metadata?.hotel_id,
        hotel_name: hotel?.name,
        client_first_name: metadata?.client_first_name,
        client_last_name: metadata?.client_last_name,
        client_email: metadata?.client_email,
        phone: metadata?.client_phone,
        room_number: metadata?.room_number || null,
        client_note: metadata?.client_note || null,
        booking_date: metadata?.booking_date,
        booking_time: metadata?.booking_time,
        status: 'pending',
        payment_method: 'card',
        payment_status: 'paid',
        total_price: parseFloat(metadata?.total_price || '0'),
        trunk_id: trunkId, // Auto-assign trunk
      })
      .select()
      .single();

    if (bookingError) {
      console.error("[CHECKOUT-SUCCESS] Booking creation error:", bookingError);
      throw bookingError;
    }

    console.log("[CHECKOUT-SUCCESS] Booking created:", booking.id);

    // Ajouter les traitements
    for (const treatment of treatments) {
      const { error: treatmentError } = await supabase
        .from('booking_treatments')
        .insert({
          booking_id: booking.id,
          treatment_id: treatment.id,
        });

      if (treatmentError) {
        console.error("[CHECKOUT-SUCCESS] Treatment insert error:", treatmentError);
      }
    }

    // Récupérer les noms des traitements pour l'email
    const { data: treatmentDetails } = await supabase
      .from('treatment_menus')
      .select('name, price')
      .in('id', treatments.map((t: any) => t.id));

    // Format treatments with name and price separated properly
    const treatmentNames = treatmentDetails?.map(t => `${t.name} - ${t.price}€`) || [];

    // Envoyer l'email de confirmation au client
    try {
      await supabase.functions.invoke('send-booking-confirmation', {
        body: {
          email: metadata?.client_email,
          bookingNumber: booking.booking_id.toString(),
          clientName: `${metadata?.client_first_name} ${metadata?.client_last_name}`,
          hotelName: hotel?.name,
          roomNumber: metadata?.room_number,
          bookingDate: metadata?.booking_date,
          bookingTime: metadata?.booking_time,
          treatments: treatmentNames,
          totalPrice: parseFloat(metadata?.total_price || '0'),
          currency: 'EUR',
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log("[CHECKOUT-SUCCESS] Confirmation email sent");
    } catch (emailError) {
      console.error("[CHECKOUT-SUCCESS] Email error:", emailError);
    }

    // Envoyer l'email aux admins
    try {
      await supabase.functions.invoke('notify-admin-new-booking', {
        body: { bookingId: booking.id },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log("[CHECKOUT-SUCCESS] Admin notification sent");
    } catch (adminError) {
      console.error("[CHECKOUT-SUCCESS] Admin notification error:", adminError);
    }

    // Déclencher les notifications push aux coiffeurs
    try {
      await supabase.functions.invoke('trigger-new-booking-notifications', {
        body: { bookingId: booking.id },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log("[CHECKOUT-SUCCESS] Push notifications sent");
    } catch (pushError) {
      console.error("[CHECKOUT-SUCCESS] Push notification error:", pushError);
    }


    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingId: booking.booking_id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CHECKOUT-SUCCESS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
