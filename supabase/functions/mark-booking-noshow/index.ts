import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import { needsStripeSettlementOnCancel } from "../_shared/cancel-booking-rules.ts";
import { canApplyClientTierFinancials, amountsFromRefundPercent } from "../_shared/cancellation-tiers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SupabaseServiceClient = ReturnType<typeof createClient>;

const NON_STRIPE_PAYMENT_METHODS = new Set([
  "partner_billed",
  "gift_amount",
  "voucher",
  "offert",
  "cash",
]);

function isNonStripePaymentMethod(method: unknown): boolean {
  return NON_STRIPE_PAYMENT_METHODS.has(String(method ?? ""));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function centsToCurrency(cents: number): number {
  return roundCurrency(cents / 100);
}

async function assertCallerCanMarkNoShow(
  supabase: SupabaseServiceClient,
  callerUserId: string,
  booking: { id: string; hotel_id: string; therapist_id?: string | null },
): Promise<void> {
  // Admin always allowed.
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId);
  const roleNames = (roles ?? []).map((r) => String((r as { role?: unknown }).role ?? ""));
  const isAdminRole = roleNames.includes("admin");
  if (isAdminRole) return;

  const { data: adminRow } = await supabase
    .from("admins")
    .select("id")
    .eq("user_id", callerUserId)
    .maybeSingle();
  if (adminRow) return;

  // Concierge allowed on assigned venues.
  if (roleNames.includes("concierge")) {
    const { data: assignedHotels, error: hotelsError } = await supabase.rpc(
      "get_concierge_hotels",
      { _user_id: callerUserId },
    );
    if (hotelsError) throw new Error("Failed to verify venue access");
    const hotelIds: string[] = Array.isArray(assignedHotels)
      ? assignedHotels.map((row: { hotel_id: string }) => row.hotel_id)
      : [];
    if (hotelIds.includes(booking.hotel_id)) return;
  }

  // Therapist allowed only if assigned / accepted.
  const { data: callerTherapist } = await supabase
    .from("therapists")
    .select("id")
    .eq("user_id", callerUserId)
    .maybeSingle();
  if (callerTherapist) {
    if (booking.therapist_id === callerTherapist.id) return;
    const { data: btRow } = await supabase
      .from("booking_therapists")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("therapist_id", callerTherapist.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (btRow) return;
  }

  throw new Error("Forbidden");
}

async function capturePaymentIntentFull(
  stripe: Stripe,
  bookingId: string,
  paymentIntentId: string,
): Promise<string[]> {
  const warnings: string[] = [];
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "requires_capture") {
    warnings.push(`pi_status_${pi.status}_no_capture`);
    return warnings;
  }
  const capturableCents = Math.max(0, pi.amount_capturable ?? pi.amount);
  if (capturableCents <= 0) {
    warnings.push("pi_capturable_zero");
    return warnings;
  }
  await stripe.paymentIntents.capture(
    paymentIntentId,
    { amount_to_capture: capturableCents },
    { idempotencyKey: `mark-noshow:${bookingId}:capture-full` },
  );
  warnings.push("pi_captured_full");
  return warnings;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { bookingId, reason } = body as { bookingId?: string; reason?: string };
    if (!bookingId) return jsonResponse({ error: "bookingId is required" }, 400);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();
    if (bookingError || !booking) return jsonResponse({ error: "Booking not found" }, 404);
    if (["cancelled", "completed", "noshow"].includes(String(booking.status))) {
      return jsonResponse({ error: "Booking cannot be marked as no-show in its current status" }, 400);
    }

    await assertCallerCanMarkNoShow(supabase, user.id, {
      id: booking.id,
      hotel_id: booking.hotel_id,
      therapist_id: booking.therapist_id,
    });

    const [{ data: paymentInfo }, { data: hotel }] = await Promise.all([
      supabase
        .from("booking_payment_infos")
        .select("stripe_payment_intent_id, stripe_setup_intent_id, estimated_price")
        .eq("booking_id", bookingId)
        .maybeSingle(),
      supabase
        .from("hotels")
        .select("client_cancellation_cutoff_hours, cancellation_tiers, timezone")
        .eq("id", booking.hotel_id)
        .single(),
    ]);

    const skipStripe = isNonStripePaymentMethod(booking.payment_method) ||
      booking.payment_status === "charged_to_room";

    // For no-show: 0% refunded when Stripe can capture/refund; otherwise no money action.
    const needsStripe = needsStripeSettlementOnCancel(booking.payment_status, booking.payment_method);
    const totalPrice = Number(booking.total_price) || 0;
    let depositAmount = paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice;

    let feeApplied = 0;
    let refundAmount = 0;

    let stripeClient: Stripe | null = null;
    let piStatus: string | null = null;
    let capturableCents: number | null = null;
    let refundableCents: number | null = null;

    if (!skipStripe && paymentInfo?.stripe_payment_intent_id) {
      const { client: stripe } = await getStripeForVenue(supabase, booking.hotel_id);
      stripeClient = stripe;
      const pi = await stripe.paymentIntents.retrieve(paymentInfo.stripe_payment_intent_id);
      piStatus = pi.status;
      if (pi.status === "requires_capture") {
        capturableCents = Math.max(0, pi.amount_capturable ?? pi.amount);
        depositAmount = centsToCurrency(capturableCents);
      } else if (pi.status === "succeeded") {
        refundableCents = Math.max(0, pi.amount_received ?? 0);
        depositAmount = centsToCurrency(refundableCents);
      }
    }

    const canSettleFinancials = canApplyClientTierFinancials(needsStripe, skipStripe, piStatus);
    if (canSettleFinancials) {
      // No-show => 0% refunded.
      const amounts = amountsFromRefundPercent(depositAmount, 0);
      feeApplied = amounts.feeApplied;
      refundAmount = 0;
    }

    const { data: updatedRows, error: dbErr } = await supabase.rpc("begin_booking_noshow", {
      _booking_id: bookingId,
      _reason: reason ?? null,
      _changed_by: user.id,
      _cancellation_fee_amount: feeApplied,
      _refund_amount: refundAmount,
    });
    if (dbErr) {
      const msg = String(dbErr.message ?? "");
      if (msg.includes("booking_not_found")) return jsonResponse({ error: "Booking not found" }, 404);
      if (msg.includes("booking_not_cancellable")) return jsonResponse({ error: "Booking cannot be marked as no-show" }, 409);
      return jsonResponse({ error: "Failed to update booking" }, 500);
    }

    const updatedBooking = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
    if (!updatedBooking) return jsonResponse({ error: "Failed to update booking" }, 500);

    let stripeWarnings: string[] = [];
    if (canSettleFinancials && stripeClient && paymentInfo?.stripe_payment_intent_id) {
      // no-show settlement: capture full hold if applicable; no refund otherwise.
      if (piStatus === "requires_capture") {
        stripeWarnings = await capturePaymentIntentFull(stripeClient, bookingId, paymentInfo.stripe_payment_intent_id);
      } else {
        stripeWarnings = ["no_refund_on_noshow"];
      }
    }

    // Keep existing admin notification behavior.
    await supabase.functions.invoke("notify-noshow", {
      body: { bookingId },
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    });

    return jsonResponse({ success: true, feeApplied, refundAmount, stripeWarnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") return jsonResponse({ error: "Forbidden" }, 403);
    console.error("[mark-booking-noshow] Unexpected error:", err);
    return jsonResponse({ error: message }, 500);
  }
});

