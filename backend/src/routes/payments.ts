import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { stripe } from "../lib/stripe";

/**
 * Payment routes — authenticated (therapist or admin).
 *
 * Migrated from: supabase/functions/finalize-payment/index.ts
 *
 * MIGRATION NOTE:
 * This is a SKELETON showing the structure. The full logic from
 * finalize-payment should be ported here. Key improvement over
 * the Edge Function: no cold start, persistent Stripe connection.
 */
const payments = new Hono();

// All payment routes require authentication
payments.use("/*", authMiddleware);

/**
 * POST /payments/finalize
 * Finalize payment for a booking (card or room).
 */
payments.post("/finalize", async (c) => {
  const { booking_id, payment_method, final_amount, signature_data } =
    await c.req.json();

  if (!booking_id || !payment_method || !final_amount) {
    return c.json(
      { error: "Missing required fields: booking_id, payment_method, final_amount" },
      400
    );
  }

  if (payment_method === "room" && !signature_data) {
    return c.json(
      { error: "Signature is required for room payment" },
      400
    );
  }

  if (final_amount <= 0) {
    return c.json({ error: "Final amount must be positive" }, 400);
  }

  // Fetch booking with relations
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select(
      `
      id, booking_id, hotel_id, therapist_id,
      client_email, client_first_name, client_last_name, room_number,
      booking_treatments(
        treatment_id,
        treatment_menus(name, price, duration)
      ),
      hotels(name, vat, hotel_commission, currency, venue_type),
      therapists(
        first_name, last_name, stripe_account_id,
        hourly_rate, rate_45, rate_60, rate_90
      )
    `
    )
    .eq("id", booking_id)
    .single();

  if (bookingError || !booking) {
    return c.json({ error: `Booking not found: ${booking_id}` }, 404);
  }

  const hotel = (booking as any).hotels;
  if (!hotel) {
    return c.json({ error: "Hotel not found for booking" }, 404);
  }

  // Calculate commissions
  const vatRate = hotel.vat || 20;
  const hotelCommissionRate = hotel.hotel_commission || 10;
  const totalTTC = final_amount;
  const totalHT = totalTTC / (1 + vatRate / 100);
  const hotelCommission = totalHT * (hotelCommissionRate / 100);

  // TODO: Port computeTherapistEarnings from _shared/therapistEarnings.ts
  // and complete the full finalize-payment logic here.
  // The pattern is identical to the Edge Function, minus Deno-specific code.

  const breakdown = {
    totalTTC,
    totalHT: Math.round(totalHT * 100) / 100,
    tvaAmount: Math.round((totalTTC - totalHT) * 100) / 100,
    tvaRate: vatRate,
    hotelCommission: Math.round(hotelCommission * 100) / 100,
    hotelCommissionRate,
  };

  // Placeholder — the full logic from finalize-payment goes here
  return c.json({
    success: true,
    payment_method,
    breakdown,
    message: "TODO: Port full finalize-payment logic",
  });
});

export default payments;
