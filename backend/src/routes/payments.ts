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

/**
 * POST /payments/charge-card
 * Charge a saved Stripe card for a completed booking (off-session).
 */
payments.post("/charge-card", async (c) => {
  try {
    const { bookingId, finalAmount } = await c.req.json();

    const { data: paymentInfo, error: fetchError } = await supabaseAdmin
      .from("booking_payment_infos")
      .select("*, customers(stripe_customer_id)")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!paymentInfo) {
      throw new Error("Informations de paiement introuvables pour cette réservation.");
    }

    if (finalAmount > paymentInfo.estimated_price) {
      throw new Error(`Alerte sécurité : le montant demandé (${finalAmount}€) dépasse le devis autorisé (${paymentInfo.estimated_price}€).`);
    }

    const stripeCustomerId = (paymentInfo as any).customers?.stripe_customer_id;
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

    await supabaseAdmin
      .from("booking_payment_infos")
      .update({
        payment_status: "charged",
        payment_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("booking_id", bookingId);

    await supabaseAdmin
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", bookingId);

    return c.json({ success: true, paymentIntent });
  } catch (error: any) {
    console.error("Erreur charge-saved-card:", error);
    return c.json({ success: false, error: error.message }, 400);
  }
});

payments.post("/bundle", async (c) => {
  try {
    const { hotelId, clientData, bundleItems, totalPrice, giftData } = await c.req.json();

    // --- Validation ---
    if (!hotelId || !clientData || !bundleItems || !Array.isArray(bundleItems) || bundleItems.length === 0) {
      throw new Error("Missing required data");
    }
    if (!clientData.firstName || !clientData.lastName || !clientData.phone || !clientData.email) {
      throw new Error("Missing required client information");
    }

    // --- Verify bundle prices server-side ---
    const bundleIds = bundleItems.map((b: { bundleId: string }) => b.bundleId).filter(Boolean);
    if (bundleIds.length === 0) {
      throw new Error("No valid bundle IDs provided");
    }

    const { data: bundles, error: bundlesError } = await supabaseAdmin
      .from('treatment_bundles')
      .select('id, name, name_en, price, currency, total_sessions, validity_days, status, hotel_id')
      .in('id', bundleIds);

    if (bundlesError || !bundles || bundles.length === 0) {
      throw new Error("Failed to fetch valid bundles");
    }

    const invalidBundles = bundles.filter((b: any) => b.status !== 'active' || (b.hotel_id !== null && b.hotel_id !== hotelId));
    if (invalidBundles.length > 0) {
      throw new Error("Some bundles are not available for this hotel");
    }

    // Calculate verified total
    const bundleMap = new Map(bundles.map((b: any) => [b.id, b]));
    let verifiedTotal = 0;
    const lineItems: { price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number }[] = [];

    for (const item of bundleItems) {
      const bundle = bundleMap.get(item.bundleId) as any;
      if (!bundle) throw new Error(`Bundle ${item.bundleId} not found`);
      const qty = item.quantity || 1;
      verifiedTotal += (bundle.price || 0) * qty;
      lineItems.push({
        price_data: {
          currency: (bundle.currency || 'eur').toLowerCase(),
          product_data: {
            name: `${bundle.name} (${bundle.total_sessions} séances)`,
          },
          unit_amount: Math.round((bundle.price || 0) * 100),
        },
        quantity: qty,
      });
    }

    if (verifiedTotal <= 0) {
      throw new Error("Invalid total price");
    }

    // --- Hotel info ---
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .select('currency, name')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError || !hotel) {
      throw new Error("Hotel not found");
    }

    // --- Stripe customer upsert ---
    let stripeCustomerId: string;
    const existingCustomers = await stripe.customers.list({ email: clientData.email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      stripeCustomerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: clientData.email,
        name: `${clientData.firstName} ${clientData.lastName}`,
        phone: clientData.phone,
      });
      stripeCustomerId = newCustomer.id;
    }

    // Upsert customer in our DB
    await supabaseAdmin
      .from('customers')
      .upsert({
        phone: clientData.phone,
        email: clientData.email,
        first_name: clientData.firstName,
        last_name: clientData.lastName,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: 'phone' });

    // --- Create Stripe Checkout Session (payment mode) ---
    const origin = c.req.header("origin") || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${origin}/client/${hotelId}/confirmation/bundle?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/client/${hotelId}/payment`,
      metadata: {
        type: 'bundle_purchase',
        hotelId,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        clientEmail: clientData.email,
        phone: clientData.phone,
        roomNumber: clientData.roomNumber || '',
        note: clientData.note || '',
        bundleItems: JSON.stringify(bundleItems),
        isGift: giftData?.isGift ? 'true' : 'false',
        giftDeliveryMode: giftData?.deliveryMode || '',
        senderName: giftData?.senderName || '',
        senderEmail: giftData?.isGift ? (clientData.email || '') : '',
        recipientName: giftData?.recipientName || '',
        recipientEmail: giftData?.recipientEmail || '',
        giftMessage: giftData?.giftMessage || '',
      },
    });

    return c.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-BUNDLE-PAYMENT] Error:", errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

export default payments;
