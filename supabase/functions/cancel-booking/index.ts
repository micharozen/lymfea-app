import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type Stripe from "https://esm.sh/stripe@18.5.0";
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
const CLIENT_CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000;
const MAX_CANCELLATION_REASON_LENGTH = 500;
const NON_STRIPE_PAYMENT_METHODS = new Set([
  "partner_billed",
  "gift_amount",
  "voucher",
  "offert",
  "cash",
]);

type SupabaseServiceClient = ReturnType<typeof createClient<any, "public", any>>;

type BookingCancelSnapshot = {
  status: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_fee_amount: number | null;
  refund_amount: number | null;
  stripe_refund_id: string | null;
};

function snapshotBookingForRevert(booking: Record<string, unknown>): BookingCancelSnapshot {
  return {
    status: String(booking.status),
    cancellation_reason: (booking.cancellation_reason as string | null) ?? null,
    cancelled_at: (booking.cancelled_at as string | null) ?? null,
    cancelled_by: (booking.cancelled_by as string | null) ?? null,
    cancellation_fee_amount: booking.cancellation_fee_amount != null
      ? Number(booking.cancellation_fee_amount)
      : null,
    refund_amount: booking.refund_amount != null ? Number(booking.refund_amount) : null,
    stripe_refund_id: (booking.stripe_refund_id as string | null) ?? null,
  };
}

function parseBookingDateTime(booking: Record<string, unknown>, timezone = "UTC"): Date | null {
  const bookingDate = String(booking.booking_date ?? "");
  const bookingTime = String(booking.booking_time ?? "");
  if (!bookingDate || !bookingTime) return null;

  const [year, month, day] = bookingDate.split("-").map(Number);
  const [hour, minute, second = 0] = bookingTime.split(":").map(Number);
  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(localAsUtc)).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asIfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const timezoneOffsetMs = asIfLocal - localAsUtc;

  return new Date(localAsUtc - timezoneOffsetMs);
}

function isInsideClientCancellationCutoff(booking: Record<string, unknown>, timezone?: string | null): boolean {
  const bookingDateTime = parseBookingDateTime(booking, timezone || "UTC");
  if (!bookingDateTime) return true;
  return bookingDateTime.getTime() - Date.now() <= CLIENT_CANCELLATION_CUTOFF_MS;
}

function isNonStripePaymentMethod(method: unknown): boolean {
  return NON_STRIPE_PAYMENT_METHODS.has(String(method ?? ""));
}

async function insertCancellationAuditLog(
  supabase: SupabaseServiceClient,
  {
    bookingId,
    changedBy,
    metadata,
    newValues,
    isFlagged = false,
    flagType = null,
  }: {
    bookingId: string;
    changedBy: string | null;
    metadata: Record<string, unknown>;
    newValues: Record<string, unknown>;
    isFlagged?: boolean;
    flagType?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("audit_log")
    .insert({
      table_name: "bookings",
      record_id: bookingId,
      changed_by: changedBy,
      change_type: "action",
      old_values: null,
      new_values: newValues,
      source: "cancel-booking",
      metadata,
      is_flagged: isFlagged,
      flag_type: flagType,
    });

  if (error) {
    console.error("[cancel-booking] Failed to write cancellation audit log:", error);
  }
}

async function revertBookingCancellation(
  supabase: SupabaseServiceClient,
  bookingId: string,
  previous: BookingCancelSnapshot,
): Promise<void> {
  const { error } = await supabase
    .from("bookings")
    .update({
      status: previous.status,
      cancellation_reason: previous.cancellation_reason,
      cancelled_at: previous.cancelled_at,
      cancelled_by: previous.cancelled_by,
      cancellation_fee_amount: previous.cancellation_fee_amount ?? 0,
      refund_amount: previous.refund_amount ?? 0,
      stripe_refund_id: previous.stripe_refund_id,
    })
    .eq("id", bookingId);

  if (error) {
    console.error("[cancel-booking] CRITICAL: failed to revert booking after Stripe error:", error);
  }
}

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

    const cancellationReason = reason?.trim() || null;
    if (cancellationReason && cancellationReason.length > MAX_CANCELLATION_REASON_LENGTH) {
      return jsonResponse({ error: "Cancellation reason is too long" }, 400);
    }

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

    if (!resolvedBookingId) {
      return jsonResponse({ error: "bookingId or token is required" }, 400);
    }
    const targetBookingId = resolvedBookingId;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", targetBookingId)
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

    const previousState = snapshotBookingForRevert(booking);
    const isPublicTokenRequest = !!token;

    const [{ data: paymentInfo }, { data: hotel }] = await Promise.all([
      supabase
        .from("booking_payment_infos")
        .select("stripe_payment_intent_id, stripe_setup_intent_id, card_brand, card_last4, estimated_price")
        .eq("booking_id", targetBookingId)
        .maybeSingle(),
      supabase
        .from("hotels")
        .select("cancellation_fee_amount, cancellation_fee_type, timezone")
        .eq("id", booking.hotel_id)
        .single(),
    ]);

    const isPartnerBilled = booking.payment_method === "partner_billed";
    const isChargedToRoom = booking.payment_status === "charged_to_room";
    const needsStripe = needsStripeSettlement(booking);
    const skipStripe = isNonStripePaymentMethod(booking.payment_method) || isChargedToRoom;
    const lang = resolveCancelLang(booking.language);

    if (isPublicTokenRequest && isInsideClientCancellationCutoff(booking, hotel?.timezone)) {
      return jsonResponse({ error: getCancelMessages(lang).clientCutoffError }, 400);
    }

    if (needsStripe && !skipStripe && !paymentInfo?.stripe_payment_intent_id) {
      console.error("[cancel-booking] paid booking missing Stripe PaymentIntent", {
        bookingId: targetBookingId,
        payment_status: booking.payment_status,
        payment_method: booking.payment_method,
      });
      return jsonResponse({ error: getCancelMessages(lang).missingPaymentIntentError }, 409);
    }

    let stripeClientForSettlement: Stripe | null = null;
    let hasCapturablePaymentIntentHold = false;
    const wantsLateFeeOnPaymentIntentHold =
      charge_late_fee &&
      isAdmin &&
      !needsStripe &&
      !skipStripe &&
      !!paymentInfo?.stripe_payment_intent_id;

    if (wantsLateFeeOnPaymentIntentHold && paymentInfo?.stripe_payment_intent_id) {
      const { client: stripe } = await getStripeForVenue(supabase, booking.hotel_id);
      stripeClientForSettlement = stripe;
      const pi = await stripe.paymentIntents.retrieve(paymentInfo.stripe_payment_intent_id);
      if (pi.status !== "requires_capture") {
        return jsonResponse(
          { error: getCancelMessages(lang).lateFeeHoldNotCapturableError },
          409,
        );
      }
      hasCapturablePaymentIntentHold = true;
    }

    const totalPrice = Number(booking.total_price) || 0;
    const depositAmount = paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice;

    const applyLateFee =
      charge_late_fee &&
      isAdmin &&
      !isPartnerBilled &&
      !skipStripe &&
      (needsStripe || hasCapturablePaymentIntentHold);

    let fee = 0;
    if (applyLateFee && hotel) {
      if (hotel.cancellation_fee_type === "fixed") {
        fee = Number(hotel.cancellation_fee_amount) || 0;
      } else if (hotel.cancellation_fee_type === "percentage") {
        fee = Math.round(totalPrice * (Number(hotel.cancellation_fee_amount) / 100) * 100) / 100;
      }
    }

    const feeApplied = applyLateFee ? Math.min(fee, depositAmount) : 0;
    const refundAmount = needsStripe ? Math.max(0, depositAmount - feeApplied) : 0;

    const { data: cancelledRows, error: cancelUpdateError } = await supabase
      .rpc("begin_booking_cancellation", {
        _booking_id: targetBookingId,
        _reason: cancellationReason,
        _cancelled_by: callerUserId,
        _cancellation_fee_amount: feeApplied,
        _refund_amount: refundAmount,
      });

    if (cancelUpdateError) {
      console.error("[cancel-booking] DB cancel update error:", cancelUpdateError);
      const errorMessage = String(cancelUpdateError.message ?? "");
      if (errorMessage.includes("booking_not_found")) {
        return jsonResponse({ error: "Booking not found" }, 404);
      }
      if (errorMessage.includes("booking_not_cancellable")) {
        return jsonResponse({ error: "Booking cannot be cancelled in its current status" }, 409);
      }
      return jsonResponse({ error: "Failed to update booking" }, 500);
    }

    const cancelledBooking = Array.isArray(cancelledRows) ? cancelledRows[0] : cancelledRows;
    if (!cancelledBooking) {
      console.error("[cancel-booking] DB cancel update returned no booking", { bookingId: targetBookingId });
      return jsonResponse({ error: "Failed to update booking" }, 500);
    }

    let stripeRefundId: string | null = null;
    let setupIntentCancelled = false;
    let settlementWarnings: string[] = [];

    if (!skipStripe) {
      try {
        const stripe = stripeClientForSettlement ??
          (await getStripeForVenue(supabase, booking.hotel_id)).client;
        const settlement = await runStripeSettlement({
          stripe,
          bookingId: targetBookingId,
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
        settlementWarnings = settlement.warnings;
        console.log("[cancel-booking] Stripe settlement", settlement);
      } catch (stripeErr) {
        await revertBookingCancellation(supabase, targetBookingId, previousState);
        const message = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[cancel-booking] Stripe error (booking reverted):", stripeErr);
        return jsonResponse(
          { error: getCancelMessages(lang).stripeError(message) },
          502,
        );
      }
    }

    if (stripeRefundId) {
      const { error: refundIdError } = await supabase
        .from("bookings")
        .update({ stripe_refund_id: stripeRefundId })
        .eq("id", targetBookingId);

      if (refundIdError) {
        console.error(
          "[cancel-booking] CRITICAL: Stripe succeeded but stripe_refund_id not saved:",
          refundIdError,
        );
        await insertCancellationAuditLog(supabase, {
          bookingId: targetBookingId,
          changedBy: callerUserId,
          isFlagged: true,
          flagType: "stripe_reconciliation",
          newValues: {
            action: "cancel_booking_stripe_refund_id_persist_failed",
            stripe_refund_id: stripeRefundId,
            refund_amount: refundAmount,
          },
          metadata: {
            booking_id: booking.booking_id,
            error: refundIdError.message,
            requires_reconciliation: true,
          },
        });
      }
    }

    await insertCancellationAuditLog(supabase, {
      bookingId: targetBookingId,
      changedBy: callerUserId,
      newValues: {
        action: "cancel_booking",
        cancellation_fee_amount: feeApplied,
        refund_amount: refundAmount,
        stripe_refund_id: stripeRefundId,
        setup_intent_cancelled: setupIntentCancelled,
      },
      metadata: {
        booking_id: booking.booking_id,
        payment_status: booking.payment_status,
        payment_method: booking.payment_method,
        stripe_warnings: settlementWarnings,
        public_token: isPublicTokenRequest,
      },
    });

    const shouldSendNotification = isPublicTokenRequest || send_notification;
    if (shouldSendNotification) {
      await sendCancellationNotifications({
        supabase,
        booking,
        paymentInfo,
        reason: cancellationReason ?? undefined,
        totalPrice,
        depositAmount,
        feeApplied,
        refundAmount,
        needsStripe,
        isPartnerBilled,
        isChargedToRoom,
        resolvedBookingId: targetBookingId,
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
