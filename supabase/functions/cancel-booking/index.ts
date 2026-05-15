import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { brand } from "../_shared/brand.ts";
import {
  getBaseEmailTemplate,
  getEmailHeader,
  getInfoRow,
  getDateTimeHighlight,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json();
    const {
      bookingId,
      token,
      reason,
      charge_late_fee = false,
      send_notification = true,
    } = body as {
      bookingId?: string;
      token?: string;
      reason?: string;
      charge_late_fee?: boolean;
      send_notification?: boolean;
    };

    // ── 1. AUTH & BOOKING RESOLUTION ─────────────────────────────────────────

    let resolvedBookingId: string | null = null;
    let callerUserId: string | null = null;

    if (token) {
      // Anonymous client flow: resolve by short_token or UUID
      const isUuid = UUID_REGEX.test(token);
      const { data: booking } = await supabase
        .from("bookings")
        .select("id")
        .or(isUuid ? `id.eq.${token},short_token.eq.${token}` : `short_token.eq.${token}`)
        .maybeSingle();
      if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
      resolvedBookingId = booking.id;
    } else if (bookingId) {
      // Authenticated flow: verify caller
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await anonClient.auth.getUser();
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      callerUserId = user.id;
      resolvedBookingId = bookingId;
    } else {
      return jsonResponse({ error: "bookingId or token is required" }, 400);
    }

    // ── 2. FETCH BOOKING ──────────────────────────────────────────────────────

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", resolvedBookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return jsonResponse({ error: "Booking cannot be cancelled in its current status" }, 400);
    }

    console.log("[cancel-booking] Processing", { bookingId: resolvedBookingId, status: booking.status });

    // ── 3. ADMIN ROLE CHECK FOR LATE FEES ────────────────────────────────────

    let isAdmin = false;
    if (callerUserId) {
      const { data: adminRow } = await supabase
        .from("admins")
        .select("id")
        .eq("user_id", callerUserId)
        .maybeSingle();
      isAdmin = !!adminRow;
    }
    const isPartnerBilled = booking.payment_method === "partner_billed";
    const applyLateFee = charge_late_fee && isAdmin && !isPartnerBilled;

    // ── 4. FETCH PAYMENT INFO & VENUE FEE POLICY ─────────────────────────────

    const [{ data: paymentInfo }, { data: hotel }] = await Promise.all([
      supabase
        .from("booking_payment_infos")
        .select("stripe_payment_intent_id, stripe_setup_intent_id, card_brand, card_last4, estimated_price")
        .eq("booking_id", resolvedBookingId)
        .maybeSingle(),
      supabase
        .from("hotels")
        .select("cancellation_fee_amount, cancellation_fee_type")
        .eq("id", booking.hotel_id)
        .single(),
    ]);

    const totalPrice = Number(booking.total_price) || 0;
    const depositAmount = paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice;

    let fee = 0;
    if (applyLateFee && hotel) {
      if (hotel.cancellation_fee_type === "fixed") {
        fee = Number(hotel.cancellation_fee_amount) || 0;
      } else if (hotel.cancellation_fee_type === "percentage") {
        fee = Math.round(totalPrice * (Number(hotel.cancellation_fee_amount) / 100) * 100) / 100;
      }
    }

    const feeApplied = isPartnerBilled ? 0 : Math.min(fee, depositAmount);
    const refundAmount = isPartnerBilled ? 0 : Math.max(0, depositAmount - feeApplied);

    // ── 5. STRIPE ACTION (before DB — fail closed on payment errors) ─────────

    let stripeRefundId: string | null = null;

    if (!isPartnerBilled && paymentInfo?.stripe_payment_intent_id) {
      try {
        const { client: stripe } = await getStripeForVenue(supabase, booking.hotel_id);
        const pi = await stripe.paymentIntents.retrieve(paymentInfo.stripe_payment_intent_id);

        if (pi.status === "requires_capture") {
          if (feeApplied > 0) {
            const captureCents = Math.min(
              Math.round(feeApplied * 100),
              pi.amount_capturable ?? pi.amount,
            );
            if (captureCents > 0) {
              await stripe.paymentIntents.capture(pi.id, { amount_to_capture: captureCents });
              console.log("[cancel-booking] Pre-auth partial capture (late fee):", pi.id, captureCents);
            }
          } else {
            await stripe.paymentIntents.cancel(pi.id);
            console.log("[cancel-booking] Pre-auth cancelled:", pi.id);
          }
        } else if (pi.status === "succeeded") {
          const refundCents = Math.round(refundAmount * 100);
          if (refundCents > 0) {
            const refund = await stripe.refunds.create({
              payment_intent: pi.id,
              amount: refundCents,
            });
            stripeRefundId = refund.id;
            console.log("[cancel-booking] Refund created:", refund.id, "amount:", refundCents);
          } else {
            console.log("[cancel-booking] No refund needed (fee covers full deposit)");
          }
        } else {
          console.log("[cancel-booking] PI status is", pi.status, "— no Stripe action needed");
        }
      } catch (stripeErr) {
        const message = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[cancel-booking] Stripe error:", stripeErr);
        return jsonResponse(
          { error: `Échec du remboursement Stripe : ${message}` },
          502,
        );
      }
    } else if (isPartnerBilled) {
      console.log("[cancel-booking] partner_billed — skip Stripe");
    } else {
      console.log("[cancel-booking] No payment intent — no Stripe action");
    }

    // ── 6. UPDATE BOOKING IN DB ───────────────────────────────────────────────

    const updatePayload: Record<string, unknown> = {
      status: "cancelled",
      cancellation_reason: reason || "Annulation",
      cancelled_at: new Date().toISOString(),
      cancellation_fee_amount: feeApplied,
      refund_amount: refundAmount,
    };
    if (callerUserId) updatePayload.cancelled_by = callerUserId;
    if (stripeRefundId) updatePayload.stripe_refund_id = stripeRefundId;

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("id", resolvedBookingId);

    if (updateError) {
      console.error("[cancel-booking] DB update error:", updateError);
      return jsonResponse({ error: "Failed to update booking" }, 500);
    }

    // ── 7. NOTIFICATIONS ──────────────────────────────────────────────────────

    if (send_notification) {
      // a. Therapist + admin + Slack via existing function
      try {
        await supabase.functions.invoke("handle-booking-cancellation", {
          body: { bookingId: resolvedBookingId, cancellationReason: reason },
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        });
      } catch (e) {
        console.error("[cancel-booking] handle-booking-cancellation error:", e);
      }

      // b. Client email
      if (booking.client_email) {
        try {
          const formattedDate = new Date(booking.booking_date).toLocaleDateString("fr-FR", {
            weekday: "short", day: "numeric", month: "short",
          });
          const formattedTime = booking.booking_time?.substring(0, 5) || "";
          const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
          const clientName = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();

          const cardLine = paymentInfo?.card_brand && paymentInfo?.card_last4
            ? `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`
            : null;

          const paymentDetailsBlock = isPartnerBilled
            ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
                  <tr><td style="padding: 20px;">
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151;">Détails de l'annulation</p>
                    ${getInfoRow("Total du rendez-vous", `${totalPrice}€`)}
                    ${getInfoRow("Paiement", "Facturé au partenaire (aucun remboursement carte)")}
                    ${reason ? getInfoRow("Motif", reason) : ""}
                  </td></tr>
                </table>`
            : `
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
                  <tr><td style="padding: 20px;">
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151;">Détails du remboursement</p>
                    ${getInfoRow("Total du rendez-vous", `${totalPrice}€`)}
                    ${cardLine ? getInfoRow("Acompte versé", `${cardLine} — ${depositAmount}€`) : getInfoRow("Acompte versé", `${depositAmount}€`)}
                    ${feeApplied > 0 ? getInfoRow("Frais d'annulation", `${feeApplied}€`) : ""}
                    ${getInfoRow("Montant remboursé", `${refundAmount}€`)}
                    ${reason ? getInfoRow("Motif", reason) : ""}
                  </td></tr>
                </table>`;

          const emailContent = `
            ${getEmailHeader("Votre rendez-vous a été annulé", "❌ Annulation", "#ef4444")}
            <tr>
              <td style="padding: 24px 30px 0;">
                ${getDateTimeHighlight(formattedDate, formattedTime)}
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${getInfoRow("Client", clientName)}
                  ${getInfoRow("Établissement", booking.hotel_name ?? "")}
                  ${booking.room_number ? getInfoRow("Chambre", String(booking.room_number)) : ""}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 30px 0;">
                ${paymentDetailsBlock}
              </td>
            </tr>
          `;

          const html = getBaseEmailTemplate(emailContent, {
            showButton: !!siteUrl,
            buttonText: "Réserver à nouveau",
            buttonUrl: siteUrl,
          });

          await sendEmail({
            to: booking.client_email,
            subject: `❌ Votre rendez-vous du ${formattedDate} a été annulé`,
            html,
          });
        } catch (emailErr) {
          console.error("[cancel-booking] Client email error:", emailErr);
        }
      }

      // c. Client SMS
      const clientPhone: string = booking.phone ?? "";
      if (clientPhone) {
        try {
          const formattedDate = new Date(booking.booking_date).toLocaleDateString("fr-FR", {
            weekday: "short", day: "numeric", month: "short",
          });
          const formattedTime = booking.booking_time?.substring(0, 5) || "";
          const smsBody = isPartnerBilled
            ? `Bonjour ${booking.client_first_name ?? ""}, votre soin chez ${booking.hotel_name ?? ""} le ${formattedDate} à ${formattedTime} a été annulé.`
            : `Bonjour ${booking.client_first_name ?? ""}, votre soin chez ${booking.hotel_name ?? ""} le ${formattedDate} à ${formattedTime} a été annulé. Remboursement : ${refundAmount}€.`;
          const smsResult = await sendSms({ to: clientPhone, body: smsBody });
          if (smsResult.error) {
            console.error("[cancel-booking] SMS error:", smsResult.error);
          } else {
            console.log("[cancel-booking] Client SMS sent:", smsResult.sid);
          }
        } catch (smsErr) {
          console.error("[cancel-booking] SMS exception:", smsErr);
        }
      }
    }

    console.log("[cancel-booking] Done", { refundAmount, stripeRefundId });

    return jsonResponse({ success: true, refund_amount: refundAmount, stripe_refund_id: stripeRefundId });
  } catch (error: any) {
    console.error("[cancel-booking] Unexpected error:", error);
    return jsonResponse({ error: error.message ?? "Unknown error" }, 500);
  }
});
