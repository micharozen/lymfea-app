import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bookingId, finalAmount } = await req.json();

    // POINT 4 : Utilisation de maybeSingle() au lieu de single() pour éviter le crash 406
    const { data: paymentInfo, error: fetchError } = await supabaseAdmin
      .from("booking_payment_infos")
      .select("*, customers(stripe_customer_id)")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!paymentInfo) {
      throw new Error("Informations de paiement introuvables pour cette réservation.");
    }

    // POINT 3 : Validation du montant côté serveur (Sécurité Bloquante)
    // On vérifie que le front n'essaie pas de débiter plus que le devis initial/mis à jour
    if (finalAmount > paymentInfo.estimated_price) {
      throw new Error(`Alerte sécurité : le montant demandé (${finalAmount}€) dépasse le devis autorisé (${paymentInfo.estimated_price}€).`);
    }

    const stripeCustomerId = paymentInfo.customers?.stripe_customer_id;
    if (!stripeCustomerId || !paymentInfo.stripe_payment_method_id) {
      throw new Error("Moyen de paiement ou client Stripe manquant.");
    }

    // Création du PaymentIntent en "off_session" (le client n'est pas devant l'écran)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(finalAmount * 100), // Stripe attend des centimes
      currency: "eur",
      customer: stripeCustomerId,
      payment_method: paymentInfo.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { booking_id: bookingId },
    });

    // Mise à jour du statut dans la table isolée de paiement
    await supabaseAdmin
      .from("booking_payment_infos")
      .update({
        payment_status: "charged",
        payment_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent.id
      })
      .eq("booking_id", bookingId);

    // POINT 8 : On passe le booking principal à 'paid' uniquement quand le débit a vraiment eu lieu
    await supabaseAdmin
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);

    return new Response(JSON.stringify({ success: true, paymentIntent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    // Si la carte est refusée (ex: pas de fonds), Stripe renvoie une erreur ici
    console.error("Erreur charge-saved-card:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});