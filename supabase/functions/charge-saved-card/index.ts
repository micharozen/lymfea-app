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
    const { bookingId, finalAmount } = await req.json();
    console.log(`[CHARGE-CARD] Débit de ${finalAmount}€ pour la résa ${bookingId}`);

    if (!bookingId || !finalAmount) throw new Error("bookingId ou finalAmount manquant");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // 1. Récupérer l'ID de la carte dans NOTRE base
    const { data: paymentInfo } = await supabase
      .from('booking_payment_infos')
      .select('stripe_payment_method_id')
      .eq('booking_id', bookingId)
      .single();

    if (!paymentInfo || !paymentInfo.stripe_payment_method_id) {
      throw new Error("Aucune carte enregistrée trouvée pour cette réservation.");
    }

    // 2. Récupérer la devise
    const { data: booking } = await supabase
      .from('bookings')
      .select('hotel_currency')
      .eq('id', bookingId)
      .single();

    // 3. LA MAGIE : On demande directement à Stripe le propriétaire de la carte !
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentInfo.stripe_payment_method_id);
    const stripeCustomerId = paymentMethod.customer;

    if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
        throw new Error("Impossible de retrouver le client Stripe (Customer) associé à cette carte.");
    }

    // 4. Débiter la carte avec le bon Customer
    console.log(`[CHARGE-CARD] Appel à Stripe... Customer trouvé : ${stripeCustomerId}`);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(finalAmount * 100), // Stripe veut des centimes
      currency: (booking?.hotel_currency || 'eur').toLowerCase(),
      customer: stripeCustomerId, 
      payment_method: paymentInfo.stripe_payment_method_id,
      off_session: true, // Le client n'est pas devant l'écran
      confirm: true,     // On confirme immédiatement
      description: `Paiement du soin - Réservation ${bookingId}`,
    });

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Le paiement a été refusé (Statut: ${paymentIntent.status})`);
    }

    // 5. Mettre à jour la base de données
    console.log("[CHARGE-CARD] Paiement réussi !");
    await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
    await supabase.from('booking_payment_infos').update({ payment_status: 'paid' }).eq('booking_id', bookingId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[CHARGE-CARD] Erreur fatale :", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, 
    });
  }
});