import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import {
  assertCallerCanCancelBooking,
  needsStripeSettlement,
} from "./permissions.ts";
import { getCancelMessages, resolveCancelLang } from "./i18n.ts";
import { runStripeSettlement } from "./stripe-settlement.ts";
import { sendCancellationNotifications } from "./notifications.ts";

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

    let resolvedBookingId: string | null = null;
    let callerUserId: string | null = null;

    if (token) {
      const isUuid = UUID_REGEX.test(token);
      const { data: booking } = await supabase
        .from("bookings")
        .select("id")
        .or(isUuid ? `id.eq.${token},short_token.eq.${token}` : `short_token.eq.${token}`)
        .maybeSingle();
      if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
      resolvedBookingId = booking.id;
    } else if (bookingId) {
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

    let isAdmin = false;
    if (callerUserId) {
      try {
        const authz = await assertCallerCanCancelBooking(supabase, callerUserId, {
          id: booking.id,
          hotel_id: booking.hotel_id,
          therapist_id: booking.therapist_id,
        });
        isAdmin = authz.isAdmin;
      } catch (authzErr) {
        const message = authzErr instanceof Error ? authzErr.message : String(authzErr);
        if (message === "Forbidden") return jsonResponse({ error: "Forbidden" }, 403);
        console.error("[cancel-booking] Authorization error:", authzErr);
        return jsonResponse({ error: message }, 500);
      }
    }

    const isPartnerBilled = booking.payment_method === "partner_billed";
    const isChargedToRoom = booking.payment_status === "charged_to_room";
    const needsStripe = needsStripeSettlement(booking);
    const applyLateFee = charge_late_fee && isAdmin && needsStripe && !isPartnerBilled;
    const skipStripe = isPartnerBilled || isChargedToRoom;

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

    const feeApplied = needsStripe ? Math.min(fee, depositAmount) : 0;
    const refundAmount = needsStripe ? Math.max(0, depositAmount - feeApplied) : 0;

    let stripeRefundId: string | null = null;
    let setupIntentCancelled = false;

    if (!skipStripe) {
      try {
        const { client: stripe } = await getStripeForVenue(supabase, booking.hotel_id);
        const settlement = await runStripeSettlement({
          stripe,
          paymentStatus: booking.payment_status,
          paymentMethod: booking.payment_method,
          paymentInfo: paymentInfo ?? null,
          needsRefund: needsStripe,
          feeApplied,
          refundAmount,
          skipStripe: false,
        });
        stripeRefundId = settlement.stripeRefundId;
        setupIntentCancelled = settlement.setupIntentCancelled;
        console.log("[cancel-booking] Stripe settlement", settlement);
      } catch (stripeErr) {
        const lang = resolveCancelLang(booking.language);
        const message = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[cancel-booking] Stripe error:", stripeErr);
        return jsonResponse(
          { error: getCancelMessages(lang).stripeError(message) },
          502,
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: "cancelled",
      cancellation_reason: reason?.trim() || null,
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

    if (send_notification) {
      await sendCancellationNotifications({
        supabase,
        booking,
        paymentInfo,
        reason,
        totalPrice,
        depositAmount,
        feeApplied,
        refundAmount,
        needsStripe,
        isPartnerBilled,
        isChargedToRoom,
        resolvedBookingId,
      });
    }

    return jsonResponse({
      success: true,
      refund_amount: refundAmount,
      stripe_refund_id: stripeRefundId,
      setup_intent_cancelled: setupIntentCancelled,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cancel-booking] Unexpected error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
