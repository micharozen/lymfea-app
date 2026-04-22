import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { stripe } from "../lib/stripe";
import { sendEmail } from "../lib/email";
import { isInBlockedSlot } from "../lib/blocked-slots";

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

payments.post("/purchase-bundle", async (c) => {
  try {
    const { sessionId } = await c.req.json();

    if (!sessionId) {
      throw new Error("Missing session ID");
    }

    // --- Retrieve Stripe session ---
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    // Check this is a bundle purchase
    if (session.metadata?.type !== 'bundle_purchase') {
      throw new Error("Invalid session type");
    }

    // Prevent double-processing: check if bundles already created for this session
    const { data: existingBundles } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id')
      .eq('payment_reference', `stripe:${sessionId}`)
      .limit(1);

    if (existingBundles && existingBundles.length > 0) {
      // Already processed — return existing bundle IDs
      const { data: allBundles } = await supabaseAdmin
        .from('customer_treatment_bundles')
        .select('id, bundle_id, total_sessions, total_amount_cents, expires_at, redemption_code, is_gift, gift_delivery_mode, recipient_name, treatment_bundles(name, name_en, bundle_type, amount_cents)')
        .eq('payment_reference', `stripe:${sessionId}`);

      return c.json({
        success: true,
        alreadyProcessed: true,
        customerBundles: allBundles,
      });
    }

    console.log('[PURCHASE-BUNDLE] Session metadata:', JSON.stringify(session.metadata));

    const {
      hotelId,
      firstName,
      lastName,
      clientEmail,
      phone,
      bundleItems: bundleItemsJson,
      isGift: isGiftMeta,
      giftDeliveryMode,
      senderName,
      senderEmail,
      recipientName,
      recipientEmail,
      giftMessage,
    } = session.metadata!;

    const bundleItems = JSON.parse(bundleItemsJson);

    // --- Find or create customer ---
    const { data: customerId, error: customerError } = await supabaseAdmin.rpc('find_or_create_customer', {
      _phone: phone,
      _first_name: firstName,
      _last_name: lastName,
      _email: clientEmail,
    });

    if (customerError) {
      console.error('[PURCHASE-BUNDLE] Error finding/creating customer:', customerError);
      throw new Error("Failed to create customer record");
    }

    // --- Fetch bundle templates to determine types ---
    const bundleIds = bundleItems.map((b: { bundleId: string }) => b.bundleId);
    const { data: bundleTemplates, error: templatesError } = await supabaseAdmin
      .from('treatment_bundles')
      .select('id, bundle_type')
      .in('id', bundleIds);

    if (templatesError || !bundleTemplates) {
      throw new Error("Failed to fetch bundle templates");
    }

    const templateTypeMap = new Map(bundleTemplates.map(t => [t.id, t.bundle_type]));

    // --- Create customer bundles ---
    const createdBundles: { id: string; bundleId: string }[] = [];
    const paymentRef = `stripe:${sessionId}`;

    for (const item of bundleItems) {
      const qty = item.quantity || 1;
      const bundleType = templateTypeMap.get(item.bundleId) ?? 'cure';

      for (let i = 0; i < qty; i++) {
        let customerBundleId: string;

        if (bundleType === 'cure') {
          const { data, error: createError } = await supabaseAdmin.rpc('create_customer_bundle', {
            _customer_id: customerId,
            _bundle_id: item.bundleId,
            _hotel_id: hotelId,
            _booking_id: null,
          });

          if (createError) {
            console.error('[PURCHASE-BUNDLE] Failed to create customer bundle:', createError.message);
            throw new Error(`Failed to create bundle: ${createError.message}`);
          }
          customerBundleId = data;
        } else {
          // gift_treatments or gift_amount → use create_customer_gift_card
          const { data, error: createError } = await supabaseAdmin.rpc('create_customer_gift_card', {
            _bundle_id: item.bundleId,
            _purchaser_customer_id: customerId,
            _hotel_id: hotelId,
            _is_gift: false,
            _payment_reference: paymentRef,
          });

          if (createError) {
            console.error('[PURCHASE-BUNDLE] Failed to create gift card:', createError.message);
            throw new Error(`Failed to create gift card: ${createError.message}`);
          }
          customerBundleId = data[0].customer_bundle_id;
        }

        // Tag with stripe session for idempotency (gift cards already have it via _payment_reference)
        if (bundleType === 'cure') {
          await supabaseAdmin
            .from('customer_treatment_bundles')
            .update({ payment_reference: paymentRef })
            .eq('id', customerBundleId);
        }

        createdBundles.push({ id: customerBundleId, bundleId: item.bundleId });
      }
    }

    // --- Fetch bundle details for confirmation ---
    const bundleDetailIds = createdBundles.map(b => b.id);
    const { data: bundleDetails } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id, bundle_id, total_sessions, expires_at, treatment_bundles(name, name_en)')
      .in('id', bundleDetailIds);

    // --- Send confirmation email only for cure bundles (not gift cards) ---
    const hasNonGiftBundles = bundleDetails?.some((b: any) => b.treatment_bundles?.bundle_type === 'cure');
    if (hasNonGiftBundles) {
      try {
        // TODO: replace with direct import once send-booking-confirmation is migrated
        await supabaseAdmin.functions.invoke('send-booking-confirmation', {
          body: {
            type: 'bundle_purchase',
            email: clientEmail,
            firstName,
            lastName,
            hotelId,
            bundles: bundleDetails,
          },
        });
      } catch (emailError) {
        console.error('[PURCHASE-BUNDLE] Email sending failed (non-blocking):', emailError);
      }
    }

    // --- Fetch venue for email templates ---
    const { data: venue } = await supabaseAdmin
      .from('hotels')
      .select('name, image')
      .eq('id', hotelId)
      .single();
    const venueName = venue?.name || '';
    const logoUrl = venue?.image || 'https://xfkujlgettlxdgrnqluw.supabase.co/storage/v1/object/public/assets/brand-logo-email.png';

    // --- Send gift card email to recipient via Resend template ---
    const isGift = isGiftMeta === 'true';
    console.log('[PURCHASE-BUNDLE] Gift email check — isGift:', isGift, 'recipientEmail:', recipientEmail, 'deliveryMode:', giftDeliveryMode);
    console.log('[PURCHASE-BUNDLE] Condition result:', isGift && recipientEmail && giftDeliveryMode === 'email');
    if (isGift && recipientEmail && giftDeliveryMode === 'email') {
      try {
        // Build template variables from the first gift bundle
        const giftBundle = bundleDetails?.find((b: any) => b.is_gift);
        const bundleName = giftBundle?.treatment_bundles?.name ?? 'Carte Cadeau';
        const amountCents = giftBundle?.total_amount_cents ?? giftBundle?.treatment_bundles?.amount_cents ?? 0;
        const valueDisplay = `${(amountCents / 100).toFixed(0)} EUR`;
        const expiryDate = giftBundle?.expires_at
          ? new Date(giftBundle.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';

        const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || '';
        const activateUrl = `${siteUrl}/portal/redeem`;
        const redemptionCode = giftBundle?.redemption_code ?? '';

        const result = await sendEmail({
          to: recipientEmail,
          subject: `You've received a gift card — ${venueName}`,
          templateId: '1b1674f1-5145-4bb5-8fce-b8b9f2c405ac',
          templateVariables: {
            logo_url: logoUrl,
            recipient_name: recipientName || '',
            recipient_email: recipientEmail,
            venue_name: venueName,
            bundle_title: bundleName,
            value_display: valueDisplay,
            expiry_date: expiryDate,
            activate_url: activateUrl,
            sender_name: senderName || firstName || '',
            gift_message: giftMessage || '',
            redemption_code: redemptionCode,
          },
        });

        if (result.error) {
          console.error('[PURCHASE-BUNDLE] Resend API error for gift email:', result.error);
        } else {
          console.log('[PURCHASE-BUNDLE] Gift recipient email sent to:', recipientEmail, 'id:', result.id);
        }
      } catch (giftEmailError) {
        console.error('[PURCHASE-BUNDLE] Gift recipient email failed (non-blocking):', giftEmailError);
      }
    }

    // --- Send cure confirmation email to buyer via Resend template ---
    const cureBundles = bundleDetails?.filter((b: any) => b.treatment_bundles?.bundle_type === 'cure');
    if (cureBundles && cureBundles.length > 0) {
      try {
        const cureBundle = cureBundles[0];
        const bundleName = cureBundle.treatment_bundles?.name ?? 'Cure';
        const totalSessions = cureBundle.total_sessions ?? 0;
        const valueDisplay = `${totalSessions} session${totalSessions > 1 ? 's' : ''}`;
        const expiryDate = cureBundle.expires_at
          ? new Date(cureBundle.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';

        const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || '';
        const bookingUrl = `${siteUrl}/client/${hotelId}/treatments`;

        const result = await sendEmail({
          to: clientEmail,
          subject: `Your treatment package is activated — ${venueName}`,
          templateId: '378deb7f-307f-40e9-8054-6bf0c29beef9',
          templateVariables: {
            logo_url: logoUrl,
            recipient_name: firstName || '',
            venue_name: venueName,
            bundle_title: bundleName,
            value_display: valueDisplay,
            expiry_date: expiryDate,
            booking_url: bookingUrl,
          },
        });

        if (result.error) {
          console.error('[PURCHASE-BUNDLE] Resend API error for cure email:', result.error);
        }

        console.log('[PURCHASE-BUNDLE] Cure confirmation email sent to:', clientEmail);
      } catch (cureEmailError) {
        console.error('[PURCHASE-BUNDLE] Cure email failed (non-blocking):', cureEmailError);
      }
    }

    return c.json({
      success: true,
      customerBundles: bundleDetails,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PURCHASE-BUNDLE] Error:", errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

payments.post("/confirm-setup", async (c) => {
  try {
    const { sessionId } = await c.req.json();

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'setup_intent.payment_method'] });
    const meta = session.metadata || {};

    const { data: existingPaymentInfo } = await supabaseAdmin
      .from('booking_payment_infos')
      .select('booking_id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingPaymentInfo) {
      console.log("[CONFIRM-SETUP] Réservation déjà existante pour cette session :", existingPaymentInfo.booking_id);
      return c.json({ success: true, bookingId: existingPaymentInfo.booking_id });
    }

    if (!meta.hotelId) throw new Error("Données de réservation introuvables dans la session Stripe.");

    const treatmentIds = JSON.parse(meta.treatmentIds || "[]");

    const { data: treatments } = await supabaseAdmin.from('treatment_menus').select('price, duration').in('id', treatmentIds);
    const verifiedPrice = (treatments || []).reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = (treatments || []).reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    const { data: hotel } = await supabaseAdmin.from('hotels').select('name').eq('id', meta.hotelId).maybeSingle();

    let customerId = null;
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (meta.clientEmail) {
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('email', meta.clientEmail)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        if (stripeCustomerId) {
          await supabaseAdmin.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', customerId);
        }
      } else {
        const { data: newCustomer } = await supabaseAdmin
          .from('customers')
          .insert({
            first_name: meta.firstName,
            last_name: meta.lastName,
            email: meta.clientEmail,
            phone: meta.phone,
            stripe_customer_id: stripeCustomerId
          })
          .select('id')
          .single();
        if (newCustomer) customerId = newCustomer.id;
      }
    }

    const { data: bookingId, error: rpcError } = await supabaseAdmin.rpc('reserve_trunk_atomically', {
      _booking_date: meta.bookingDate,
      _booking_time: meta.bookingTime,
      _client_email: meta.clientEmail || null,
      _client_first_name: meta.firstName,
      _client_last_name: meta.lastName,
      _client_note: meta.note || null,
      _customer_id: customerId,
      _duration: totalDuration,
      _hotel_id: meta.hotelId,
      _hotel_name: hotel?.name || 'Hotel',
      _language: meta.language || 'fr',
      _payment_method: 'card',
      _payment_status: 'pending',
      _phone: meta.phone,
      _room_number: meta.roomNumber || null,
      _status: 'pending',
      _therapist_gender: meta.therapistGender || null,
      _total_price: verifiedPrice,
      _treatment_ids: treatmentIds
    });

    if (rpcError) {
      console.error("[CONFIRM-SETUP] Erreur RPC lors de la réservation :", rpcError);
      throw new Error(`Désolé, ce créneau vient tout juste d'être réservé ou une erreur est survenue (${rpcError.message})`);
    }

    if (!bookingId) {
      throw new Error("Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.");
    }

    await supabaseAdmin.from('bookings').update({ therapist_id: null }).eq('id', bookingId);

    if (treatmentIds && treatmentIds.length > 0) {
      const treatmentInserts = treatmentIds.map((id: string) => ({
        booking_id: bookingId,
        treatment_id: id,
      }));
      const { error: treatmentsError } = await supabaseAdmin
        .from('booking_treatments')
        .insert(treatmentInserts);
      if (treatmentsError) {
        console.error("[CONFIRM-SETUP] Erreur lors de l'ajout des soins :", treatmentsError);
      }
    }

    const setupIntent = session.setup_intent as import("stripe").Stripe.SetupIntent;
    const paymentMethodId = typeof setupIntent?.payment_method === 'string' ? setupIntent.payment_method : (setupIntent?.payment_method as import("stripe").Stripe.PaymentMethod)?.id;
    const paymentMethodCard = typeof setupIntent?.payment_method !== 'string' ? (setupIntent?.payment_method as import("stripe").Stripe.PaymentMethod)?.card : null;

    if (paymentMethodId && setupIntent) {
      await supabaseAdmin.from('booking_payment_infos').insert({
        booking_id: bookingId,
        customer_id: customerId,
        stripe_payment_method_id: paymentMethodId,
        stripe_setup_intent_id: setupIntent.id,
        stripe_session_id: sessionId,
        card_brand: paymentMethodCard?.brand || null,
        card_last4: paymentMethodCard?.last4 || null,
        estimated_price: verifiedPrice,
        payment_status: 'card_saved'
      });
    }

    return c.json({ success: true, bookingId });
  } catch (error: any) {
    console.error("[CONFIRM-SETUP] Erreur :", error.message);
    return c.json({ error: error.message }, 500);
  }
});

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

async function isInBlockedSlot(
  hotelId: string,
  bookingDate: string,
  bookingTime: string,
  durationMinutes: number
): Promise<boolean> {
  const { data: blockedSlots, error } = await supabaseAdmin
    .from('venue_blocked_slots')
    .select('start_time, end_time, days_of_week')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  if (error || !blockedSlots || blockedSlots.length === 0) {
    return false;
  }

  const dayOfWeek = new Date(bookingDate + 'T00:00:00').getDay();
  const bookingStartMinutes = timeToMinutes(bookingTime);
  const bookingEndMinutes = bookingStartMinutes + durationMinutes;

  return blockedSlots.some((block: any) => {
    if (block.days_of_week !== null && !block.days_of_week.includes(dayOfWeek)) {
      return false;
    }
    const blockStartMinutes = timeToMinutes(block.start_time);
    const blockEndMinutes = timeToMinutes(block.end_time);
    return bookingStartMinutes < blockEndMinutes && bookingEndMinutes > blockStartMinutes;
  });
}

payments.post("/setup-intent", async (c) => {
  try {
    const {
      bookingData,
      clientData,
      treatmentIds,
      treatments: treatmentsPayload,
      hotelId,
      language,
      therapistGender,
      giftAmountUsage,
    } = await c.req.json();

    if (!bookingData || !clientData || !hotelId) {
      throw new Error("Missing required data");
    }

    if (!clientData.firstName || !clientData.lastName || !clientData.phone || !clientData.email) {
      throw new Error("Missing required client information (including email)");
    }

    const effectiveTreatmentIds: string[] = treatmentIds || (treatmentsPayload || []).map((t: any) => t.treatmentId);

    if (!Array.isArray(effectiveTreatmentIds) || effectiveTreatmentIds.length === 0) {
      throw new Error("At least one treatment is required");
    }

    const { data: treatments, error: treatmentsError } = await supabaseAdmin
      .from('treatment_menus')
      .select('id, name, price, hotel_id, status, duration')
      .in('id', effectiveTreatmentIds);

    if (treatmentsError || !treatments || treatments.length === 0) {
      throw new Error("Failed to fetch valid treatments");
    }

    const invalidTreatments = treatments.filter(t =>
      (t.hotel_id !== null && t.hotel_id !== hotelId) || t.status !== 'active'
    );

    if (invalidTreatments.length > 0) {
      throw new Error("Some treatments are not available for this hotel");
    }

    const rawTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    const giftDeductionEuros = giftAmountUsage?.amountCents
      ? Math.round(giftAmountUsage.amountCents / 100)
      : 0;
    const verifiedTotalPrice = Math.max(rawTotalPrice - giftDeductionEuros, 0);

    if (verifiedTotalPrice <= 0 && !giftAmountUsage) {
      throw new Error("Invalid total price calculated");
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .select('currency, name, offert, opening_time, closing_time')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError || !hotel) {
      throw new Error("Hotel not found");
    }

    if (hotel.offert) {
      throw new Error("Ce lieu propose actuellement des soins offerts.");
    }

    if (hotel.opening_time && hotel.closing_time) {
      const bookingMinutes = parseInt(bookingData.time.split(':')[0]) * 60 + parseInt(bookingData.time.split(':')[1]);
      const openMinutes = parseInt(hotel.opening_time.split(':')[0]) * 60 + parseInt(hotel.opening_time.split(':')[1]);
      const closeMinutes = parseInt(hotel.closing_time.split(':')[0]) * 60 + parseInt(hotel.closing_time.split(':')[1]);
      if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
        return c.json({ error: 'BLOCKED_SLOT' }, 400);
      }
    }

    if (await isInBlockedSlot(hotelId, bookingData.date, bookingData.time, totalDuration)) {
      return c.json({ error: 'BLOCKED_SLOT' }, 400);
    }

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

    const { error: upsertError } = await supabaseAdmin
      .from('customers')
      .upsert({
        phone: clientData.phone,
        email: clientData.email,
        first_name: clientData.firstName,
        last_name: clientData.lastName,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: 'phone' });

    if (upsertError) {
      console.error("[CREATE-SETUP-INTENT] Erreur Upsert Customer:", upsertError);
    }

    const origin = c.req.header("origin") || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      success_url: `${origin}/client/${hotelId}/confirmation/setup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/client/${hotelId}/payment`,
      metadata: {
        hotelId: hotelId,
        bookingDate: bookingData.date,
        bookingTime: bookingData.time,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        clientEmail: clientData.email,
        phone: clientData.phone,
        roomNumber: clientData.roomNumber || '',
        note: clientData.note || '',
        treatmentIds: JSON.stringify(effectiveTreatmentIds),
        language: language || 'fr',
        therapistGender: therapistGender || '',
        ...(giftAmountUsage ? {
          giftAmountCustomerBundleId: giftAmountUsage.customerBundleId,
          giftAmountCents: String(giftAmountUsage.amountCents),
        } : {}),
      },
    });

    return c.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-SETUP-INTENT] Error:", errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

export default payments;
