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
    console.log("[CONFIRM-SETUP] Starting setup intent confirmation");

    const { 
      setupIntentId, 
      hotelId, 
      bookingData, 
      clientData, 
      treatmentIds, 
      treatments: treatmentsPayload,
      language,
      therapistGender 
    } = await req.json();

    if (!setupIntentId || !hotelId || !bookingData || !clientData) {
      throw new Error("Missing required data for confirmation");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // =========================================================================
    // 🔍 ÉTAPE 1: VÉRIFIER LE STATUT CHEZ STRIPE
    // =========================================================================
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ['payment_method']
    });

    if (setupIntent.status !== 'succeeded') {
      throw new Error(`SetupIntent not successful. Status: ${setupIntent.status}`);
    }

    const paymentMethod = setupIntent.payment_method as Stripe.PaymentMethod;
    if (!paymentMethod || !paymentMethod.card) {
      throw new Error("No card details found attached to this SetupIntent");
    }

    // =========================================================================
    // 💰 ÉTAPE 2: RE-CALCULER LE PRIX (Sécurité)
    // =========================================================================
    const effectiveTreatmentIds: string[] = treatmentIds || (treatmentsPayload || []).map((t: any) => t.treatmentId);
    const variantMap: Record<string, string> = {};
    if (treatmentsPayload) {
      for (const t of treatmentsPayload) {
        if (t.variantId) variantMap[t.treatmentId] = t.variantId;
      }
    }

    const { data: treatments } = await supabase
      .from('treatment_menus')
      .select('price, duration')
      .in('id', effectiveTreatmentIds);

    const verifiedTotalPrice = (treatments || []).reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = (treatments || []).reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    const { data: hotel } = await supabase.from('hotels').select('name').eq('id', hotelId).single();

    // =========================================================================
    // 🗓️ ÉTAPE 3: CRÉER LA RÉSERVATION (RPC Atomic)
    // =========================================================================
    const { data: bookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
      _hotel_id: hotelId,
      _booking_date: bookingData.date,
      _booking_time: bookingData.time,
      _duration: totalDuration,
      _hotel_name: hotel?.name || 'Hotel',
      _client_first_name: clientData.firstName,
      _client_last_name: clientData.lastName,
      _client_email: clientData.email || null,
      _phone: clientData.phone,
      _room_number: clientData.roomNumber || null,
      _client_note: clientData.note || null,
      _status: 'pending',
      _payment_method: 'card', 
      _payment_status: 'card_saved', // 🚨 LE NOUVEAU STATUT !
      _total_price: verifiedTotalPrice,
      _language: language || 'fr',
      _treatment_ids: effectiveTreatmentIds,
      _therapist_gender: therapistGender || null,
    });

    if (rpcError) {
      if (rpcError.message?.includes('NO_TRUNK_AVAILABLE')) {
        return new Response(JSON.stringify({ error: 'SLOT_TAKEN' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 });
      }
      throw rpcError;
    }

    // Insérer les traitements
    for (const treatmentId of effectiveTreatmentIds) {
      await supabase.from('booking_treatments').insert({
        booking_id: bookingId,
        treatment_id: treatmentId,
        variant_id: variantMap[treatmentId] || null,
      });
    }

    // =========================================================================
    // 💳 ÉTAPE 4: SAUVEGARDER L'EMPREINTE DE LA CARTE EN BASE
    // =========================================================================
    
    // Récupérer le vrai customer_id de notre base
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', clientData.phone)
      .single();

    const { error: paymentInfoError } = await supabase
      .from('booking_payment_infos')
      .insert({
        booking_id: bookingId,
        customer_id: customer?.id || null,
        stripe_payment_method_id: paymentMethod.id,
        stripe_setup_intent_id: setupIntent.id,
        card_brand: paymentMethod.card.brand, // ex: 'visa'
        card_last4: paymentMethod.card.last4, // ex: '4242'
        estimated_price: verifiedTotalPrice,
        payment_status: 'card_saved'
      });

    if (paymentInfoError) {
      console.error("[CONFIRM-SETUP] Failed to insert payment info:", paymentInfoError);
      // Même si l'insert échoue, la réservation est faite. On log juste l'erreur.
    }

    // =========================================================================
    // 📧 ÉTAPE 5: DÉCLENCHER LES NOTIFICATIONS (Emails, PWA, etc.)
    // =========================================================================
    try {
      // Notification Admin / Concierge
      await supabase.functions.invoke('trigger-new-booking-notifications', {
        body: { bookingId }
      });
      // Email de confirmation au client
      await supabase.functions.invoke('send-booking-confirmation', {
        body: { bookingId }
      });
    } catch (notifError) {
      console.error("[CONFIRM-SETUP] Notifications error:", notifError);
    }

    console.log("[CONFIRM-SETUP] Success! Booking created:", bookingId);

    return new Response(
      JSON.stringify({ success: true, bookingId }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CONFIRM-SETUP] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});