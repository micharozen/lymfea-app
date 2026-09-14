// Désactivation manuelle du lien de paiement d'une réservation (issue #557).
//
// Cas d'usage : la réservation n'a plus à être réglée en ligne (carte cadeau,
// prise en charge hôtel, autre mode de règlement). On coupe alors le lien à la
// source :
//   1. le Payment Link Stripe passe `active: false` — le client tombe sur la
//      page « lien expiré » de Stripe et ne peut plus payer ;
//   2. `payment_link_expires_at` est vidé, ce qui coupe les relances
//      (send-payment-reminder) ET l'annulation automatique de la réservation
//      (check-expired-payment-links), toutes deux indexées sur cette date ;
//   3. `payment_link_cancelled_at` est horodaté et l'action est écrite dans
//      audit_log (traçabilité : qui, quand, quel lien).
//
// `payment_link_url` est volontairement conservé sur la réservation : c'est un
// élément d'historique, et le lien n'est de toute façon plus payable.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import { requireVenueAccess, VenueAuthzError } from "../_shared/venue-authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Modes de règlement qu'un admin peut poser en remplacement du paiement en
 * ligne. Miroir de MANUAL_PAYMENT_METHODS côté front (src/lib/paymentMethod.ts),
 * moins `partner_billed` qui exige de choisir le partenaire (client_type) et
 * reste géré par le dialogue « Marquer comme payé ».
 */
const ALLOWED_PAYMENT_METHODS = [
  "room",
  "card",
  "card_on_site",
  "cash",
  "offert",
  "gift_amount",
  "voucher",
  "cure_fresha",
];

/** Statuts pour lesquels le lien n'a plus lieu d'être désactivé : c'est déjà réglé. */
const SETTLED_PAYMENT_STATUSES = ["paid", "charged", "charged_to_room"];

interface CancelPaymentLinkRequest {
  bookingId: string;
  /** Nouveau mode de règlement (bookings.payment_method), facultatif. */
  paymentMethod?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Un lien supprimé côté Stripe est déjà « inactif » : ce n'est pas une erreur. */
function isMissingStripeResource(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err &&
    (err as { code?: string }).code === "resource_missing";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId, paymentMethod } = await req.json() as CancelPaymentLinkRequest;
    if (!bookingId) return jsonResponse({ error: "bookingId is required" }, 400);
    if (paymentMethod && !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return jsonResponse({ error: `Unsupported payment method: ${paymentMethod}` }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, booking_id, hotel_id, payment_status, payment_link_url")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("[cancel-payment-link] Booking fetch error:", bookingError);
      return jsonResponse({ error: "Failed to load the booking" }, 500);
    }
    if (!booking) return jsonResponse({ error: "Booking not found" }, 404);

    const { userId } = await requireVenueAccess(
      supabase,
      req.headers.get("Authorization"),
      booking.hotel_id,
    );

    if (SETTLED_PAYMENT_STATUSES.includes(booking.payment_status ?? "")) {
      return jsonResponse({ error: "Booking is already paid" }, 409);
    }

    const { data: paymentInfos } = await supabase
      .from("booking_payment_infos")
      .select("payment_link_stripe_id, payment_link_cancelled_at")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (!booking.payment_link_url && !paymentInfos?.payment_link_stripe_id) {
      return jsonResponse({ error: "No payment link on this booking" }, 409);
    }

    // Désactivation Stripe d'abord : tant qu'elle n'a pas abouti, le lien reste
    // payable et il ne faut pas afficher « désactivé » à l'équipe.
    if (paymentInfos?.payment_link_stripe_id) {
      try {
        const { client: stripe } = await getStripeForVenue(supabase, booking.hotel_id);
        await stripe.paymentLinks.update(paymentInfos.payment_link_stripe_id, { active: false });
      } catch (stripeError) {
        if (!isMissingStripeResource(stripeError)) {
          console.error("[cancel-payment-link] Stripe deactivation failed:", stripeError);
          return jsonResponse({ error: "Could not deactivate the Stripe payment link" }, 502);
        }
        console.warn(
          `[cancel-payment-link] Stripe link already gone for booking ${bookingId}`,
        );
      }
    }

    const cancelledAt = new Date().toISOString();
    const { error: infosError } = await supabase
      .from("booking_payment_infos")
      .upsert({
        booking_id: bookingId,
        payment_link_expires_at: null,
        payment_link_cancelled_at: cancelledAt,
      }, { onConflict: "booking_id" });

    if (infosError) {
      console.error("[cancel-payment-link] Payment infos update error:", infosError);
      return jsonResponse({ error: "Failed to record the cancellation" }, 500);
    }

    if (paymentMethod) {
      const { error: methodError } = await supabase
        .from("bookings")
        .update({ payment_method: paymentMethod })
        .eq("id", bookingId);
      if (methodError) {
        console.error("[cancel-payment-link] Payment method update error:", methodError);
        return jsonResponse({ error: "Failed to update the payment method" }, 500);
      }
    }

    try {
      await supabase.from("audit_log").insert({
        table_name: "bookings",
        record_id: bookingId,
        changed_by: userId,
        change_type: "action",
        old_values: null,
        new_values: {
          action: "payment_link_cancelled",
          payment_method: paymentMethod ?? undefined,
        },
        source: "admin",
        metadata: {
          booking_id: booking.booking_id,
          payment_link_url: booking.payment_link_url,
        },
      });
    } catch (auditError) {
      console.warn("[cancel-payment-link] Failed to write audit log:", auditError);
    }

    console.log(`[cancel-payment-link] booking=${bookingId} cancelled by ${userId}`);
    return jsonResponse({ success: true, cancelledAt });
  } catch (err) {
    if (err instanceof VenueAuthzError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[cancel-payment-link] Error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
