import { createClient } from "@supabase/supabase-js";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleChargeSavedCard(
  ctx: ActionContext,
): Promise<Response> {
  const { req, body, supabase } = ctx;

  try {
    const { bookingId, finalAmount } = body as {
      bookingId?: string;
      finalAmount?: number;
    };

    if (!bookingId || typeof finalAmount !== "number" || finalAmount <= 0) {
      throw new Error("Paramètres invalides.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé.");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("Non autorisé.");

    const { data: callerTherapist } = await supabase
      .from("therapists")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!callerTherapist) throw new Error("Non autorisé.");

    const { data: bookingCheck } = await supabase
      .from("bookings")
      .select("therapist_id, status, hotel_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!bookingCheck) throw new Error("Réservation introuvable.");

    // Resolve the venue's Stripe key from the booking's hotel_id (the PWA
    // caller doesn't pass hotelId — the router used the global key).
    let stripe = ctx.stripe;
    if (bookingCheck.hotel_id && bookingCheck.hotel_id !== ctx.hotelId) {
      const resolved = await getStripeForVenue(supabase, bookingCheck.hotel_id);
      stripe = resolved.client;
    }

    if (bookingCheck.therapist_id !== callerTherapist.id) {
      const { data: btRow } = await supabase
        .from("booking_therapists")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("therapist_id", callerTherapist.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (!btRow)
        throw new Error("Non autorisé : vous n'êtes pas assigné à ce soin.");
    }

    const { data: paymentInfo, error: fetchError } = await supabase
      .from("booking_payment_infos")
      .select("*, customers(stripe_customer_id)")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!paymentInfo) {
      throw new Error("Informations de paiement introuvables pour cette réservation.");
    }

    if (finalAmount > paymentInfo.estimated_price) {
      throw new Error(
        `Alerte sécurité : le montant demandé (${finalAmount}€) dépasse le devis autorisé (${paymentInfo.estimated_price}€).`,
      );
    }

    const stripeCustomerId = paymentInfo.customers?.stripe_customer_id;
    if (!stripeCustomerId || !paymentInfo.stripe_payment_method_id) {
      throw new Error("Moyen de paiement ou client Stripe manquant.");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(finalAmount * 100),
      currency: "eur",
      customer: stripeCustomerId,
      payment_method: paymentInfo.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { booking_id: bookingId },
    });

    await supabase
      .from("booking_payment_infos")
      .update({
        payment_status: "charged",
        payment_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("booking_id", bookingId);

    await supabase
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);

    return jsonResponse({
      success: true,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error("Erreur charge-saved-card:", error);
    return jsonResponse({ success: false, error: error.message }, 400);
  }
}
