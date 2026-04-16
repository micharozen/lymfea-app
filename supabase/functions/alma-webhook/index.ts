import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getAlmaPayment } from "../_shared/alma-client.ts";
import { markBookingAsPaid } from "../_shared/mark-booking-paid.ts";

serve(async (req) => {
  // Alma IPN is a simple POST — no CORS needed (server-to-server)
  try {
    const body = await req.json();
    const paymentId: string | undefined = body.payment_id || body.id;

    if (!paymentId) {
      console.error('[ALMA-WEBHOOK] Missing payment_id in IPN body');
      return new Response('Missing payment_id', { status: 400 });
    }

    console.log(`[ALMA-WEBHOOK] IPN received for payment: ${paymentId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Idempotency: check if already processed ─────────────────────────────
    const { data: existingInfo } = await supabase
      .from('booking_payment_infos')
      .select('booking_id, payment_status')
      .eq('alma_payment_id', paymentId)
      .maybeSingle();

    if (existingInfo?.payment_status === 'charged') {
      console.log(`[ALMA-WEBHOOK] Payment ${paymentId} already processed, skipping`);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // ── Re-fetch payment from Alma API (source of truth — IPN is unsigned) ──
    const almaPayment = await getAlmaPayment(paymentId);

    console.log(`[ALMA-WEBHOOK] Alma payment state: ${almaPayment.state}, amount: ${almaPayment.purchase_amount}`);

    // Only process payments that have been accepted (first installment captured)
    if (almaPayment.state !== 'in_progress') {
      console.log(`[ALMA-WEBHOOK] Payment not in_progress (state: ${almaPayment.state}), ignoring`);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // ── Find the booking via booking_payment_infos ──────────────────────────
    let bookingId: string | null = existingInfo?.booking_id ?? null;

    if (!bookingId) {
      // Fallback: lookup by alma_payment_id (first IPN before update stored the ID)
      const { data: infoByPayment } = await supabase
        .from('booking_payment_infos')
        .select('booking_id')
        .eq('alma_payment_id', paymentId)
        .maybeSingle();

      bookingId = infoByPayment?.booking_id ?? null;
    }

    if (!bookingId && almaPayment.custom_data?.booking_id) {
      // Final fallback: use custom_data embedded in the Alma payment
      bookingId = almaPayment.custom_data.booking_id;
    }

    if (!bookingId) {
      console.error(`[ALMA-WEBHOOK] Cannot find booking for payment ${paymentId}`);
      return new Response('Booking not found', { status: 404 });
    }

    // ── Verify amount matches ───────────────────────────────────────────────
    const { data: booking } = await supabase
      .from('bookings')
      .select('total_price')
      .eq('id', bookingId)
      .single();

    if (booking) {
      const expectedCents = Math.round(booking.total_price * 100);
      if (almaPayment.purchase_amount !== expectedCents) {
        console.error(
          `[ALMA-WEBHOOK] Amount mismatch: expected ${expectedCents}, got ${almaPayment.purchase_amount}`,
        );
        return new Response('Amount mismatch', { status: 400 });
      }
    }

    // ── Update booking_payment_infos ────────────────────────────────────────
    await supabase
      .from('booking_payment_infos')
      .update({
        payment_status: 'charged',
        payment_at: new Date().toISOString(),
      })
      .eq('booking_id', bookingId);

    // ── Update booking payment_method to 'alma' ─────────────────────────────
    await supabase
      .from('bookings')
      .update({ payment_method: 'alma' })
      .eq('id', bookingId);

    // ── Run shared post-payment logic ───────────────────────────────────────
    const wasUpdated = await markBookingAsPaid(supabase, {
      bookingId,
    });

    console.log(`[ALMA-WEBHOOK] Booking ${bookingId} processed, updated: ${wasUpdated}`);

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ALMA-WEBHOOK] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 },
    );
  }
});
