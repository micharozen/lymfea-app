import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import {
  getRefundedAmountForPaymentIntent,
  refundPaymentIntentWithVerification,
} from "../../_shared/stripe-refund.ts";
import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Remboursement admin autonome (partiel ou total) d'une réservation, sans
 * l'annuler. Ne modifie PAS `bookings.status`. Passe `payment_status` à
 * 'refunded' uniquement si le cumul remboursé couvre le montant encaissé.
 */
export async function handleRefund(ctx: ActionContext): Promise<Response> {
  const { req, body, supabase } = ctx;

  const { bookingId, amount } = body as {
    bookingId?: string;
    amount?: number;
  };

  if (!bookingId || typeof amount !== "number" || amount <= 0) {
    return jsonResponse({ error: "Paramètres invalides (bookingId, amount)." }, 400);
  }

  // — Autorisation : réservé aux admins —
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Non autorisé." }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return jsonResponse({ error: "Non autorisé." }, 401);

  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRole) {
    return jsonResponse({ error: "Action réservée aux administrateurs." }, 403);
  }

  // — Lecture réservation + infos de paiement —
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_id, hotel_id, total_price, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return jsonResponse({ error: "Réservation introuvable." }, 404);

  const { data: paymentInfo } = await supabase
    .from("booking_payment_infos")
    .select("stripe_payment_intent_id, refund_amount, payment_status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const paymentIntentId = paymentInfo?.stripe_payment_intent_id;
  if (!paymentIntentId) {
    return jsonResponse(
      { error: "Aucun paiement Stripe à rembourser pour cette réservation." },
      400,
    );
  }

  // — Résolution du client Stripe du lieu —
  let stripe = ctx.stripe;
  if (booking.hotel_id && booking.hotel_id !== ctx.hotelId) {
    const resolved = await getStripeForVenue(supabase, booking.hotel_id);
    stripe = resolved.client;
  }

  // — Bornes du remboursement (source de vérité = Stripe) —
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") {
    return jsonResponse(
      { error: `Le paiement n'est pas encaissé (statut Stripe: ${pi.status}).` },
      400,
    );
  }

  const { refundedCents: preExistingRefundedCents } =
    await getRefundedAmountForPaymentIntent(stripe, paymentIntentId);
  const capturedCents = pi.amount_received ?? 0;
  const maxRefundableCents = capturedCents - preExistingRefundedCents;
  const refundCents = Math.round(amount * 100);

  if (refundCents > maxRefundableCents) {
    return jsonResponse(
      {
        error: `Montant trop élevé : remboursable au maximum ${(maxRefundableCents / 100).toFixed(2)}.`,
      },
      400,
    );
  }

  // — Remboursement Stripe idempotent (clé variant avec l'état déjà remboursé
  //   pour autoriser des remboursements partiels successifs) —
  const idempotencyKey = `admin-refund:${bookingId}:${refundCents}:${preExistingRefundedCents}`;
  const { stripeRefundId } = await refundPaymentIntentWithVerification(
    stripe,
    idempotencyKey,
    paymentIntentId,
    refundCents,
    preExistingRefundedCents,
  );

  const totalRefundedCents = preExistingRefundedCents + refundCents;
  const isFull = totalRefundedCents >= capturedCents;

  // — Persistance —
  await supabase
    .from("booking_payment_infos")
    .update({
      stripe_refund_id: stripeRefundId,
      refund_amount: totalRefundedCents / 100,
      ...(isFull ? { payment_status: "refunded" } : {}),
    })
    .eq("booking_id", bookingId);

  if (isFull) {
    await supabase
      .from("bookings")
      .update({ payment_status: "refunded" })
      .eq("id", bookingId);
  }

  // — Audit log —
  try {
    await supabase.from("audit_log").insert({
      table_name: "bookings",
      record_id: bookingId,
      changed_by: user.id,
      change_type: "action",
      old_values: null,
      new_values: {
        action: "refund",
        amount,
        stripe_refund_id: stripeRefundId,
        is_partial: !isFull,
      },
      source: "admin",
      metadata: { booking_id: booking.booking_id },
    });
  } catch (auditError) {
    console.warn("[stripe-payment#refund] Failed to write audit log:", auditError);
  }

  return jsonResponse({
    success: true,
    stripe_refund_id: stripeRefundId,
    refund_amount: totalRefundedCents / 100,
    is_partial: !isFull,
  });
}
