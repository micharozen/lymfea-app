import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isInBlockedSlot } from '../_shared/blocked-slots.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CREATE-SETUP-INTENT] Starting SetupIntent creation");

    const { bookingData, clientData, treatmentIds, treatments: treatmentsPayload, hotelId } = await req.json();

    // 1. Validation de base des champs requis
    if (!bookingData || !clientData || !hotelId) {
      throw new Error("Missing required data");
    }

    if (!clientData.firstName || !clientData.lastName || !clientData.phone || !clientData.email) {
      throw new Error("Missing required client information (including email)");
    }

    // Support de l'ancienne et nouvelle méthode pour les traitements
    const effectiveTreatmentIds: string[] = treatmentIds || (treatmentsPayload || []).map((t: any) => t.treatmentId);

    if (!Array.isArray(effectiveTreatmentIds) || effectiveTreatmentIds.length === 0) {
      throw new Error("At least one treatment is required");
    }

    // Initialisation Supabase & Stripe
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // =========================================================================
    // 🚧 ÉTAPE A: VALIDATION SERVER-SIDE (Prix, Horaires, Slots)
    // =========================================================================
    
    // Récupération des traitements depuis la DB pour éviter la fraude sur les prix
    const { data: treatments, error: treatmentsError } = await supabase
      .from('treatment_menus')
      .select('id, name, price, hotel_id, status, duration')
      .in('id', effectiveTreatmentIds);

    if (treatmentsError || !treatments || treatments.length === 0) {
      throw new Error("Failed to fetch valid treatments");
    }

    // Vérifier que le traitement appartient bien à l'hôtel et est actif
    const invalidTreatments = treatments.filter(t =>
      (t.hotel_id !== null && t.hotel_id !== hotelId) || t.status !== 'active'
    );

    if (invalidTreatments.length > 0) {
      throw new Error("Some treatments are not available for this hotel");
    }

    // Calcul serveur des prix et durées
    const verifiedTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    if (verifiedTotalPrice <= 0) {
      throw new Error("Invalid total price calculated");
    }

    // Récupérer les infos de l'hôtel (Horaires, devises, etc.)
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('currency, name, offert, opening_time, closing_time')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError || !hotel) {
      throw new Error("Hotel not found");
    }

    if (hotel.offert) {
      throw new Error("Ce lieu propose actuellement des soins offerts.");
    }

    // Validation des horaires d'ouverture
    if (hotel.opening_time && hotel.closing_time) {
      const bookingMinutes = parseInt(bookingData.time.split(':')[0]) * 60 + parseInt(bookingData.time.split(':')[1]);
      const openMinutes = parseInt(hotel.opening_time.split(':')[0]) * 60 + parseInt(hotel.opening_time.split(':')[1]);
      const closeMinutes = parseInt(hotel.closing_time.split(':')[0]) * 60 + parseInt(hotel.closing_time.split(':')[1]);
      if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
        return new Response(JSON.stringify({ error: 'BLOCKED_SLOT' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
    }

    // Validation des slots bloqués (ex: Pause déjeuner de l'hôtel)
    if (await isInBlockedSlot(supabase, hotelId, bookingData.date, bookingData.time, totalDuration)) {
      return new Response(JSON.stringify({ error: 'BLOCKED_SLOT' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // =========================================================================
    // 👤 ÉTAPE B: GESTION DU CUSTOMER STRIPE ET UPSERT SUPABASE
    // =========================================================================
    
    // 1. On cherche d'abord si l'email existe chez Stripe
    let stripeCustomerId: string;
    const existingCustomers = await stripe.customers.list({ email: clientData.email, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      stripeCustomerId = existingCustomers.data[0].id;
    } else {
      // 2. Sinon, on crée un nouveau Customer Stripe
      const newCustomer = await stripe.customers.create({
        email: clientData.email,
        name: `${clientData.firstName} ${clientData.lastName}`,
        phone: clientData.phone,
      });
      stripeCustomerId = newCustomer.id;
    }

    // 3. On sauvegarde ce stripe_customer_id dans NOTRE base de données (basé sur le téléphone qui est UNIQUE)
    const { error: upsertError } = await supabase
      .from('customers')
      .upsert({
        phone: clientData.phone, // Clé de conflit
        email: clientData.email,
        first_name: clientData.firstName,
        last_name: clientData.lastName,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: 'phone' });

    if (upsertError) {
      console.error("[CREATE-SETUP-INTENT] Erreur Upsert Customer:", upsertError);
      // On ne throw pas d'erreur bloquante ici, le but principal reste d'enregistrer la carte.
    }


    // =========================================================================
    // 💳 ÉTAPE C: CRÉATION DU SETUP INTENT (L'empreinte bancaire)
    // =========================================================================
    
    // IMPORTANT: On ne fait PAS d'appel à `reserve_trunk_atomically` ici.
    // L'enregistrement en base se fera APRES que le client ait mis sa carte.

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session', // Autorise le débit futur sans le client
      metadata: {
        hotel_id: hotelId,
        booking_date: bookingData.date,
        booking_time: bookingData.time,
        estimated_total: verifiedTotalPrice.toString(),
      }
    });

    console.log("[CREATE-SETUP-INTENT] SetupIntent created:", setupIntent.id);

    return new Response(
      JSON.stringify({ 
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-SETUP-INTENT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});