import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // 1. Récupération de la session et des metadata
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'setup_intent.payment_method'] });
    const meta = session.metadata || {};

    // --- AJOUT DE CETTE VÉRIFICATION ---
    // On regarde si on n'a pas déjà une réservation pour ce sessionId
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingBooking) {
      console.log("[CONFIRM-SETUP] Réservation déjà existante pour cette session :", existingBooking.id);
      return new Response(JSON.stringify({ success: true, bookingId: existingBooking.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!meta.hotelId) throw new Error("Données de réservation introuvables dans la session Stripe.");

    const treatmentIds = JSON.parse(meta.treatmentIds || "[]");

    // 2. Calcul prix/durée
    const { data: treatments } = await supabase.from('treatment_menus').select('price, duration').in('id', treatmentIds);
    const verifiedPrice = (treatments || []).reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = (treatments || []).reduce((sum, t) => sum + (t.duration || 0), 0) || 30;
    
    // CORRECTION 1 : .maybeSingle() au lieu de .single() pour éviter l'erreur 406
    const { data: hotel } = await supabase.from('hotels').select('name').eq('id', meta.hotelId).maybeSingle();

    // 3. Création de la réservation (RPC avec les 20 paramètres)
    const { data: bookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
      _booking_date: meta.bookingDate,
      _booking_time: meta.bookingTime,
      _client_email: meta.clientEmail || null,
      _client_first_name: meta.firstName,
      _client_last_name: meta.lastName,
      _client_note: meta.note || null,
      _customer_id: null,
      _duration: totalDuration,
      _hotel_id: meta.hotelId,
      _hotel_name: hotel?.name || 'Hotel',
      _language: meta.language || 'fr',
      _payment_method: 'card',
      _payment_status: 'card_saved',
      _phone: meta.phone,
      _room_number: meta.roomNumber || null,
      _status: 'pending',
      _stripe_session_id: sessionId,
      _therapist_gender: meta.therapistGender || null,
      _total_price: verifiedPrice,
      _treatment_ids: treatmentIds
    });

    // CORRECTION 2 : Gestion propre des erreurs de créneaux (Race condition)
    if (rpcError) {
      console.error("[CONFIRM-SETUP] Erreur RPC lors de la réservation :", rpcError);
      throw new Error(`Désolé, ce créneau vient tout juste d'être réservé ou une erreur est survenue (${rpcError.message})`);
    }

    if (!bookingId) {
      throw new Error("Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.");
    }
// 🌟 RÈGLE MÉTIER : On force le retour dans le "Pool" commun
    // On annule l'assignation automatique pour que tous les thérapeutes voient la demande
    await supabase.from('bookings').update({ therapist_id: null }).eq('id', bookingId);

    
    // 4. Sauvegarde de la carte dans la nouvelle table
    const setupIntent = session.setup_intent as Stripe.SetupIntent;
    const paymentMethod = setupIntent?.payment_method as Stripe.PaymentMethod;
    
    if (paymentMethod && setupIntent) {
      await supabase.from('booking_payment_infos').insert({
        booking_id: bookingId,
        stripe_payment_method_id: paymentMethod.id,
        stripe_setup_intent_id: setupIntent.id,
        card_brand: paymentMethod.card?.brand,
        card_last4: paymentMethod.card?.last4,
        estimated_price: verifiedPrice,
        payment_status: 'card_saved'
      });
    }

    return new Response(JSON.stringify({ success: true, bookingId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    // Si une erreur contrôlée est levée, elle arrive ici et est renvoyée proprement au client (sans faire crasher le système)
    console.error("[CONFIRM-SETUP] Erreur :", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});