import { Hono } from "hono";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { supabaseAdmin } from "../lib/supabase";
import { getStripeForVenue, getGlobalStripe } from "../lib/stripe-resolver";
import {
  sendWhatsAppTemplate,
  buildPaymentConfirmedTemplateMessage,
  formatDateForWhatsApp,
} from "../lib/whatsapp";
import { brand } from "../lib/brand";
import { computeTherapistEarnings } from "../lib/therapist-earnings";

/**
 * Stripe webhook routes — no auth (verified via Stripe signature).
 *
 * Migrated from: supabase/functions/stripe-webhook/index.ts
 *
 * Per-venue webhook routing: each venue configures their endpoint URL
 * with `?hotel_id=<uuid>` in their Stripe Dashboard. We resolve the
 * matching Stripe client + webhook secret from Vault. Bookings made on
 * the platform's global Stripe account fall back to STRIPE_WEBHOOK_SECRET
 * if it exists (legacy).
 *
 * MIGRATION NOTE:
 * The full event handlers (checkout.session.completed, invoice.payment_succeeded,
 * payment failures) are still skeletons — the bulk of the original handler
 * logic from supabase/functions/stripe-webhook/index.ts (~500 lines) needs
 * to be ported. The per-venue signature verification below already matches
 * the original behavior.
 */
const webhooks = new Hono();

webhooks.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "No signature" }, 400);
  }

  // Per-venue webhook routing via ?hotel_id=<uuid> query param.
  const hotelIdParam = c.req.query("hotel_id") || null;

  let stripeClient: Stripe;
  let webhookSecret: string | null;

  if (hotelIdParam) {
    const resolved = await getStripeForVenue(supabaseAdmin, hotelIdParam);
    stripeClient = resolved.client;
    webhookSecret = resolved.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;
  } else {
    // Legacy fallback for events posted to the global endpoint (no hotel_id).
    // Will throw at this point if neither STRIPE_SECRET_KEY nor a venue key
    // is configured — which is the desired behavior (no silent acceptance).
    try {
      stripeClient = getGlobalStripe().client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe not configured";
      console.error(`[stripe-webhook] No global Stripe client: ${msg}`);
      return c.json({ error: "Webhook endpoint requires ?hotel_id=<uuid> when no global Stripe key is configured" }, 400);
    }
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? null;
  }

  if (!webhookSecret) {
    console.error(`[stripe-webhook] No webhook secret for hotel_id=${hotelIdParam ?? "<none>"}`);
    return c.json({ error: "Webhook secret not configured" }, 400);
  }

  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripeClient.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return c.json({ error: message }, 400);
  }

  console.log(`[stripe-webhook] Event: ${event.type} (hotel=${hotelIdParam ?? "global"})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          stripeClient,
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice, stripeClient);
        break;

      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event, stripeClient);
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", message);
    return c.json({ error: message }, 400);
  }
});

const logConnectStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CONNECT-WEBHOOK] ${step}${detailsStr}`);
};

webhooks.post("/stripe-connect", async (c) => {
  logConnectStep("Webhook received");

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logConnectStep("Webhook signature verified");
    } catch (err) {
      logConnectStep("Webhook signature verification failed", { error: err });
      return c.json({ error: "Webhook signature verification failed" }, 400);
    }
  } else {
    event = JSON.parse(body);
    logConnectStep("Webhook parsed without signature verification (no secret configured)");
  }

  logConnectStep("Event received", { type: event.type, id: event.id });

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    logConnectStep("Account updated event", {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });

    const isOnboardingComplete = account.details_submitted &&
                                  (account.charges_enabled || account.payouts_enabled);

    if (isOnboardingComplete) {
      logConnectStep("Onboarding appears complete, updating database");

      const { data: therapist, error: findError } = await supabaseAdmin
        .from("therapists")
        .select("id")
        .eq("stripe_account_id", account.id)
        .single();

      if (findError || !therapist) {
        logConnectStep("Therapist not found for Stripe account", { stripeAccountId: account.id });
      } else {
        const { error: updateError } = await supabaseAdmin
          .from("therapists")
          .update({ stripe_onboarding_completed: true })
          .eq("id", therapist.id);

        if (updateError) {
          logConnectStep("Error updating onboarding status", { error: updateError });
        } else {
          logConnectStep("Onboarding status updated to complete", { therapistId: therapist.id });
        }
      }
    }
  }

  if (event.type.startsWith("v2.")) {
    logConnectStep("V2 Event received (logging only)", { type: event.type });
  }

  return c.json({ received: true });
});

// ─── Handler Functions ──────────────────────────────────────────
// Ported from supabase/functions/stripe-webhook/index.ts.
// Edge-function calls (`supabaseAdmin.functions.invoke(...)`) are kept as-is
// for now: those functions have not been migrated to the Hono backend yet.

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripeClient: Stripe,
): Promise<void> {
  if (!(session.mode === "payment" && session.payment_status === "paid")) {
    return;
  }

  console.log(`[stripe-webhook] Processing paid checkout session: ${session.id}`);

  const metadata = session.metadata ?? {};

  // ── Payment-link flow ──────────────────────────────────────────
  if (metadata.source === "payment_link" && metadata.booking_id) {
    console.log(
      `[stripe-webhook] Payment link completed for booking: ${metadata.booking_id}`,
    );

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
          id,
          booking_id,
          client_email,
          client_first_name,
          client_last_name,
          phone,
          room_number,
          booking_date,
          booking_time,
          total_price,
          hotel_id,
          hotel_name,
          payment_status,
          payment_link_language,
          payment_link_channels
        `,
      )
      .eq("id", metadata.booking_id)
      .single();

    if (fetchError || !booking) {
      throw new Error(`Booking not found: ${metadata.booking_id}`);
    }

    // Idempotency guard — do not process twice
    if (booking.payment_status === "paid") {
      console.log(
        `[stripe-webhook] Booking ${metadata.booking_id} already paid, skipping`,
      );
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "paid",
        stripe_invoice_url: session.id,
      })
      .eq("id", metadata.booking_id);

    if (updateError) throw updateError;

    console.log(
      `[stripe-webhook] Booking ${metadata.booking_id} marked as paid via payment link`,
    );

    const { error: paymentInfoError } = await supabaseAdmin
      .from("booking_payment_infos")
      .update({
        payment_status: "charged",
        payment_at: new Date().toISOString(),
        stripe_session_id: session.id,
        stripe_payment_intent_id: (session.payment_intent as string) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", metadata.booking_id);
    if (paymentInfoError) {
      console.error(
        "[stripe-webhook] booking_payment_infos update failed:",
        paymentInfoError,
      );
    } else {
      console.log(
        "[stripe-webhook] booking_payment_infos updated for booking:",
        metadata.booking_id,
      );
    }

    // Deactivate the Stripe Payment Link so it cannot be reused
    try {
      const { data: paymentInfo } = await supabaseAdmin
        .from("booking_payment_infos")
        .select("payment_link_stripe_id")
        .eq("booking_id", metadata.booking_id)
        .maybeSingle();

      if (paymentInfo?.payment_link_stripe_id) {
        await stripeClient.paymentLinks.update(
          paymentInfo.payment_link_stripe_id,
          { active: false },
        );
        console.log(
          `[stripe-webhook] Payment link ${paymentInfo.payment_link_stripe_id} deactivated`,
        );
      }
    } catch (deactivateError) {
      console.error(
        "[stripe-webhook] Failed to deactivate payment link:",
        deactivateError,
      );
    }

    const wasWhatsAppUsed = booking.payment_link_channels?.includes("whatsapp");
    const clientPhone = booking.phone;

    let currency = "EUR";
    if (booking.hotel_id) {
      const { data: hotel } = await supabaseAdmin
        .from("hotels")
        .select("currency")
        .eq("id", booking.hotel_id)
        .single();
      if (hotel?.currency) currency = hotel.currency.toUpperCase();
    }

    const { data: bookingTreatments } = await supabaseAdmin
      .from("booking_treatments")
      .select("treatment_menus (name)")
      .eq("booking_id", booking.id);

    const treatmentsList =
      bookingTreatments
        ?.map((bt: any) => bt.treatment_menus?.name)
        .filter(Boolean)
        .join(", ") || "Service bien-être";

    if (wasWhatsAppUsed && clientPhone) {
      try {
        const language = (booking.payment_link_language as "fr" | "en") || "fr";
        const formattedDate = formatDateForWhatsApp(booking.booking_date);
        const currencySymbol = currency === "EUR" ? "€" : currency;
        const amountPaid = `${booking.total_price}${currencySymbol}`;

        const template = buildPaymentConfirmedTemplateMessage(
          language,
          booking.client_first_name,
          amountPaid,
          formattedDate,
          booking.booking_time,
          booking.hotel_name || "Hotel",
          booking.room_number || "-",
          booking.booking_id,
          treatmentsList,
        );

        await sendWhatsAppTemplate(clientPhone, template);
      } catch (whatsappError) {
        console.error("[stripe-webhook] WhatsApp error:", whatsappError);
      }
    }

    if (booking.client_email) {
      try {
        const { data: bookingTreatmentsEmail } = await supabaseAdmin
          .from("booking_treatments")
          .select(
            "treatment_id, treatment_menus(name, price, price_on_request)",
          )
          .eq("booking_id", booking.id);

        const treatmentsForEmail = (bookingTreatmentsEmail || []).map(
          (bt: any) => ({
            name: bt.treatment_menus?.name,
            price: bt.treatment_menus?.price,
            isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
          }),
        );

        await supabaseAdmin.functions.invoke("send-booking-confirmation", {
          body: {
            email: booking.client_email,
            bookingId: booking.id,
            bookingNumber: booking.booking_id.toString(),
            clientName: `${booking.client_first_name} ${booking.client_last_name || ""}`.trim(),
            hotelName: booking.hotel_name,
            roomNumber: booking.room_number,
            bookingDate: booking.booking_date,
            bookingTime: booking.booking_time,
            treatments: treatmentsForEmail,
            totalPrice: booking.total_price,
            currency: currency,
            siteUrl: process.env.SITE_URL || "https://lymfea.fr",
            language: booking.payment_link_language || "fr",
          },
        });
        console.log(
          "[stripe-webhook] Confirmation email sent to client (Payment Link)",
        );
      } catch (emailError) {
        console.error(
          "[stripe-webhook] Payment Link Email error:",
          emailError,
        );
      }
    }

    return;
  }

  // ── Standard checkout flow ─────────────────────────────────────
  const bookingIdFromMeta = metadata.booking_id;
  if (!bookingIdFromMeta) {
    return;
  }

  const { data: booking, error: bookingFetchError } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, booking_id, hotel_id, therapist_id, client_email, client_first_name, client_last_name, payment_status, status, total_price, booking_date, booking_time, room_number",
    )
    .eq("id", bookingIdFromMeta)
    .single();

  if (bookingFetchError || !booking) {
    return;
  }

  if (booking.payment_status === "paid") {
    return;
  }

  if (booking.status === "cancelled" || booking.status === "Annulé") {
    const { data: reactivated, error: reactivateError } =
      await supabaseAdmin.rpc("reactivate_prereservation", {
        _booking_id: booking.id,
      });

    if (reactivateError || !reactivated) {
      try {
        const paymentIntentId = session.payment_intent as string;
        if (paymentIntentId) {
          await stripeClient.refunds.create({
            payment_intent: paymentIntentId,
          });
        }
      } catch (refundError) {
        console.error("[stripe-webhook] Auto-refund failed:", refundError);
      }

      try {
        await supabaseAdmin.functions.invoke("send-slack-notification", {
          body: {
            type: "auto_refund",
            bookingId: booking.id,
            bookingNumber: booking.booking_id.toString(),
            clientName: `${booking.client_first_name} ${booking.client_last_name}`,
            reason:
              "Pre-reservation expired and slot taken by another client",
          },
        });
      } catch (slackError) {
        console.error(
          "[stripe-webhook] Slack notification failed:",
          slackError,
        );
      }

      return;
    }
  } else {
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", booking.id);

    if (updateError) throw updateError;
  }

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("name, currency, hotel_commission, vat")
    .eq("id", booking.hotel_id)
    .maybeSingle();

  const { data: therapistRow } = booking.therapist_id
    ? await supabaseAdmin
        .from("therapists")
        .select("rate_60, rate_75, rate_90")
        .eq("id", booking.therapist_id)
        .maybeSingle()
    : { data: null };

  // Get treatment details for email
  const { data: bookingTreatments } = await supabaseAdmin
    .from("booking_treatments")
    .select("treatment_id, treatment_menus(name, price, price_on_request, duration)")
    .eq("booking_id", booking.id);

  const treatmentsForEmail = (bookingTreatments || []).map((bt: any) => ({
    name: bt.treatment_menus?.name,
    price: bt.treatment_menus?.price,
    isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
  }));

  const currencyForEmail = (hotel?.currency || "EUR").toUpperCase();

  try {
    const hotelCommissionPercent = hotel?.hotel_commission ?? 10;
    const totalPrice = booking.total_price || 0;
    const vatRate = hotel?.vat || 20;
    const totalHT = totalPrice / (1 + vatRate / 100);

    const bookingDuration = (bookingTreatments || []).reduce(
      (sum: number, bt: any) => sum + (bt.treatment_menus?.duration || 0),
      0,
    );
    const therapistEarned =
      computeTherapistEarnings(
        therapistRow
          ? {
              rate_75: (therapistRow as any).rate_75 ?? null,
              rate_60: (therapistRow as any).rate_60 ?? null,
              rate_90: (therapistRow as any).rate_90 ?? null,
            }
          : null,
        bookingDuration,
      ) ?? 0;

    const hotelAmount = (totalHT * hotelCommissionPercent) / 100;
    const oomAmount = Math.max(0, totalHT - hotelAmount - therapistEarned);

    console.log(
      `[stripe-webhook] Commission breakdown: Hotel ${hotelCommissionPercent}% (${hotelAmount}€), Therapist ${therapistEarned}€, OOM ${oomAmount}€`,
    );

    const { error: oomLedgerError } = await supabaseAdmin
      .from("hotel_ledger")
      .insert({
        hotel_id: booking.hotel_id,
        booking_id: booking.id,
        amount: oomAmount,
        status: "pending",
        description: `Commission ${brand.name} - Réservation #${booking.booking_id}`,
      });

    if (oomLedgerError) {
      console.error(
        "[stripe-webhook] OOM ledger entry failed:",
        oomLedgerError,
      );
    }

    if (hotelAmount > 0) {
      await supabaseAdmin.from("hotel_ledger").insert({
        hotel_id: booking.hotel_id,
        booking_id: booking.id,
        amount: -hotelAmount,
        status: "pending",
        description: `Commission Hôtel à payer (${hotelCommissionPercent}%) - Réservation #${booking.booking_id}`,
      });
    }
  } catch (ledgerErr) {
    console.error("[stripe-webhook] Ledger entry error:", ledgerErr);
  }

  if (booking.client_email) {
    try {
      await supabaseAdmin.functions.invoke("send-booking-confirmation", {
        body: {
          email: booking.client_email,
          bookingId: booking.id,
          bookingNumber: booking.booking_id.toString(),
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: hotel?.name,
          roomNumber: booking.room_number,
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          treatments: treatmentsForEmail,
          totalPrice: booking.total_price,
          currency: currencyForEmail,
          siteUrl: metadata.site_url || "",
        },
      });
    } catch (emailError) {
      console.error("[stripe-webhook] Email error:", emailError);
    }
  }

  try {
    await supabaseAdmin.functions.invoke("notify-admin-new-booking", {
      body: { bookingId: booking.id },
    });
  } catch (adminError) {
    // ignore
  }

  try {
    await supabaseAdmin.functions.invoke("trigger-new-booking-notifications", {
      body: { bookingId: booking.id },
    });
  } catch (pushError) {
    // ignore
  }
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  stripeClient: Stripe,
): Promise<void> {
  const invoiceItems = await stripeClient.invoiceItems.list({
    invoice: invoice.id,
  });

  for (const item of invoiceItems.data) {
    const bookingId = item.metadata?.booking_id;
    if (!bookingId) continue;

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
          *,
          therapist:therapists(id, stripe_account_id, rate_60, rate_75, rate_90),
          hotel:hotels(vat),
          booking_treatments(treatment_menus(duration))
        `,
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) continue;

    const bookingAny = booking as any;

    if (!bookingAny.therapist?.stripe_account_id) {
      await supabaseAdmin
        .from("bookings")
        .update({ payment_status: "paid" })
        .eq("id", bookingId);
      continue;
    }

    // Calculate therapist share via shared util
    const bookingDur = (bookingAny.booking_treatments || []).reduce(
      (sum: number, bt: any) => sum + (bt.treatment_menus?.duration || 0),
      0,
    );
    const earnedAmount = computeTherapistEarnings(
      bookingAny.therapist
        ? {
            rate_75: bookingAny.therapist.rate_75 ?? null,
            rate_60: bookingAny.therapist.rate_60 ?? null,
            rate_90: bookingAny.therapist.rate_90 ?? null,
          }
        : null,
      bookingDur,
    );
    if (earnedAmount == null) {
      console.error(
        `[stripe-webhook] Cannot compute therapist earnings for booking ${bookingAny.booking_id}`,
      );
      continue;
    }
    const therapistAmount = Math.round(earnedAmount);
    const oomCommission = (bookingAny.total_price || 0) - therapistAmount;

    try {
      const transfer = await stripeClient.transfers.create({
        amount: therapistAmount * 100,
        currency: invoice.currency,
        destination: bookingAny.therapist.stripe_account_id,
        description: `Paiement pour réservation #${bookingAny.booking_id}`,
        metadata: {
          booking_id: bookingAny.id,
          invoice_id: invoice.id ?? null,
        },
      });

      await supabaseAdmin.from("therapist_payouts").insert({
        therapist_id: bookingAny.therapist.id,
        booking_id: bookingAny.id,
        amount: therapistAmount,
        status: "completed",
        stripe_transfer_id: transfer.id,
      });

      await supabaseAdmin.from("hotel_ledger").insert({
        hotel_id: bookingAny.hotel_id,
        booking_id: bookingAny.id,
        amount: oomCommission,
        status: "paid",
        description: `Paiement carte - Réservation #${bookingAny.booking_id}`,
      });

      await supabaseAdmin
        .from("bookings")
        .update({ payment_status: "paid" })
        .eq("id", bookingId);
    } catch (transferError) {
      await supabaseAdmin.from("therapist_payouts").insert({
        therapist_id: bookingAny.therapist.id,
        booking_id: bookingAny.id,
        amount: therapistAmount,
        status: "failed",
        error_message:
          transferError instanceof Error
            ? transferError.message
            : String(transferError),
      });
    }
  }
}

async function handlePaymentFailed(
  event: Stripe.Event,
  stripeClient: Stripe,
): Promise<void> {
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    let bookingId = session.metadata?.booking_id;

    if (!bookingId) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("stripe_invoice_url", session.id)
        .maybeSingle();
      if (booking) bookingId = booking.id;
    }

    if (!bookingId) return;

    let errorDetails: Stripe.PaymentIntent.LastPaymentError | null = null;
    if (session.payment_intent) {
      try {
        const paymentIntent = await stripeClient.paymentIntents.retrieve(
          session.payment_intent as string,
        );
        errorDetails = paymentIntent.last_payment_error ?? null;
      } catch (err) {
        // ignore
      }
    }

    const errAny = errorDetails as any;

    const { data: booking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "failed",
        payment_error_code: errorDetails?.code || "unknown",
        payment_error_message: errorDetails?.message || "Payment failed",
        payment_error_details: JSON.stringify({
          decline_code: errorDetails?.decline_code,
          network_decline_code: errAny?.network_decline_code,
          last4: errorDetails?.payment_method?.card?.last4,
          brand: errorDetails?.payment_method?.card?.brand,
          timestamp: new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .select(
        "id, booking_id, client_first_name, client_last_name, hotel_name, total_price, booking_date, booking_time",
      )
      .single();

    if (updateError) throw updateError;

    try {
      await supabaseAdmin.functions.invoke("send-slack-notification", {
        body: {
          type: "payment_failed",
          bookingId: booking.id,
          bookingNumber: booking.booking_id.toString(),
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: booking.hotel_name,
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          totalPrice: booking.total_price,
          paymentErrorCode: errorDetails?.code || "unknown",
          paymentErrorMessage: errorDetails?.message || "Payment failed",
          paymentDeclineCode: errorDetails?.decline_code,
          cardBrand: errorDetails?.payment_method?.card?.brand,
          cardLast4: errorDetails?.payment_method?.card?.last4,
        },
      });
    } catch (notifyError) {
      // ignore
    }

    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    let bookingId: string | undefined = paymentIntent.metadata?.booking_id;

    if (!bookingId) {
      try {
        const sessions = await stripeClient.checkout.sessions.list({
          payment_intent: paymentIntent.id,
          limit: 1,
        });
        if (sessions.data.length > 0)
          bookingId = sessions.data[0].metadata?.booking_id ?? undefined;
      } catch (lookupError) {
        // ignore
      }
    }

    if (!bookingId) return;

    const { data: existingBooking } = await supabaseAdmin
      .from("bookings")
      .select(
        "payment_status, id, booking_id, client_first_name, client_last_name, hotel_name, total_price, booking_date, booking_time",
      )
      .eq("id", bookingId)
      .single();

    if (existingBooking?.payment_status === "failed" || !existingBooking) {
      return;
    }

    const errorDetails = paymentIntent.last_payment_error ?? null;
    const errAny = errorDetails as any;

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "failed",
        payment_error_code: errorDetails?.code || "unknown",
        payment_error_message: errorDetails?.message || "Payment failed",
        payment_error_details: JSON.stringify({
          decline_code: errorDetails?.decline_code,
          network_decline_code: errAny?.network_decline_code,
          last4: errorDetails?.payment_method?.card?.last4,
          brand: errorDetails?.payment_method?.card?.brand,
          timestamp: new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    try {
      await supabaseAdmin.functions.invoke("send-slack-notification", {
        body: {
          type: "payment_failed",
          bookingId: existingBooking.id,
          bookingNumber: existingBooking.booking_id.toString(),
          clientName: `${existingBooking.client_first_name} ${existingBooking.client_last_name}`,
          hotelName: existingBooking.hotel_name,
          bookingDate: existingBooking.booking_date,
          bookingTime: existingBooking.booking_time,
          totalPrice: existingBooking.total_price,
          paymentErrorCode: errorDetails?.code || "unknown",
          paymentErrorMessage: errorDetails?.message || "Payment failed",
          paymentDeclineCode: errorDetails?.decline_code,
          cardBrand: errorDetails?.payment_method?.card?.brand,
          cardLast4: errorDetails?.payment_method?.card?.last4,
        },
      });
    } catch (notifyError) {
      // ignore
    }
  }
}

export default webhooks;
