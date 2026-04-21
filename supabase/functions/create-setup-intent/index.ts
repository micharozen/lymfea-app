import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
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
    const {
      bookingData,
      clientData,
      treatmentIds,
      treatments: treatmentsPayload,
      hotelId,
      language,
      therapistGender,
      draftBookingId,
      giftAmountUsage
    } = await req.json();

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

    // =========================================================================
    // 🚧 ÉTAPE A: VALIDATION SERVER-SIDE (Prix, Horaires, Slots)
    // =========================================================================
    
    // Récupération des traitements depuis la DB pour éviter la fraude sur les prix
    const { data: treatments, error: treatmentsError } = await supabaseAdmin
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
    const rawTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    // Apply gift amount deduction if present
    const giftDeductionEuros = giftAmountUsage?.amountCents
      ? Math.round(giftAmountUsage.amountCents / 100)
      : 0;
    const verifiedTotalPrice = Math.max(rawTotalPrice - giftDeductionEuros, 0);

    if (verifiedTotalPrice <= 0 && !giftAmountUsage) {
      throw new Error("Invalid total price calculated");
    }

    // Récupérer les infos de l'hôtel (Horaires, devises, etc.)
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .select('slug, currency, name, offert, opening_time, closing_time')
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
    if (await isInBlockedSlot(supabaseAdmin, hotelId, bookingData.date, bookingData.time, totalDuration)) {
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
    const { error: upsertError } = await supabaseAdmin
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
    }

    // =========================================================================
    // 💳 ÉTAPE C: CRÉATION DE LA SESSION CHECKOUT (Mode Setup)
    // =========================================================================
    
    const origin = req.headers.get("origin") || "http://localhost:5173";

    // On crée une session Checkout en mode 'setup'
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      success_url: `${origin}/client/${hotel.slug ?? hotelId}/confirmation/setup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/client/${hotel.slug ?? hotelId}/payment`,
      metadata: {
        hotelId: hotelId,
        bookingDate: bookingData.date,
        bookingTime: bookingData.time,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        clientEmail: clientData.email,
        phone: clientData.phone,
        roomNumber: clientData.roomNumber || '',
        note: clientData.note || '',
        treatmentIds: JSON.stringify(effectiveTreatmentIds),
        language: language || 'fr',
        therapistGender: therapistGender || '',
        draftBookingId: draftBookingId || '',
        ...(giftAmountUsage ? {
          giftAmountCustomerBundleId: giftAmountUsage.customerBundleId,
          giftAmountCents: String(giftAmountUsage.amountCents),
        } : {}),
      }
    });

    return new Response(
      JSON.stringify({ 
        url: session.url,
        sessionId: session.id 
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