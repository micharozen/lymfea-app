import type Stripe from "https://esm.sh/stripe@18.5.0";
import { computeOutOfHoursSurcharge } from "../../_shared/surcharge.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import type { ActionContext } from "../index.ts";
import { tryMarkCheckoutIntentConverted } from "../../_shared/checkoutIntent.ts";
import {
  computeSlotDuration,
  fetchAddonTreatmentIds,
  insertBookingTreatmentLines,
  type TreatmentLine,
} from "../../_shared/bookingTreatmentLines.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveCustomer(
  supabase: ActionContext["supabase"],
  clientEmail: string | undefined,
  stripeCustomerId: string | undefined,
  firstName: string,
  lastName: string,
  phone: string,
): Promise<string | null> {
  const basePayload = { phone, email: clientEmail, first_name: firstName, last_name: lastName };

  // Lookup by stripe_customer_id first — avoids a collision on the second UNIQUE
  // constraint when the customer's phone has changed since their first booking.
  if (stripeCustomerId) {
    const { data: byStripe } = await supabase
      .from("customers")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (byStripe) {
      await supabase.from("customers").update(basePayload).eq("id", byStripe.id);
      return byStripe.id;
    }
  }

  if (!phone) return null;
  const { data: customer } = await supabase
    .from("customers")
    .upsert(
      { ...basePayload, stripe_customer_id: stripeCustomerId },
      { onConflict: "phone" },
    )
    .select("id")
    .single();
  return customer?.id ?? null;
}

async function insertPaymentInfo(
  supabase: ActionContext["supabase"],
  params: {
    bookingId: string;
    customerId: string | null;
    paymentMethodId: string;
    setupIntentId?: string | null;
    paymentIntentId?: string | null;
    // Null for sibling bookings of a multi-group — the UNIQUE stripe_session_id
    // is claimed by the group's first booking; siblings share method/customer.
    sessionId: string | null;
    cardBrand?: string | null;
    cardLast4?: string | null;
    estimatedPrice?: number;
    // 'card_saved' for pre-authorization, 'charged' when charged at booking.
    paymentStatus: "card_saved" | "charged";
  },
) {
  await supabase.from("booking_payment_infos").insert({
    booking_id: params.bookingId,
    customer_id: params.customerId,
    stripe_payment_method_id: params.paymentMethodId,
    stripe_setup_intent_id: params.setupIntentId || null,
    stripe_payment_intent_id: params.paymentIntentId || null,
    stripe_session_id: params.sessionId,
    card_brand: params.cardBrand || null,
    card_last4: params.cardLast4 || null,
    ...(params.estimatedPrice !== undefined
      ? { estimated_price: params.estimatedPrice }
      : {}),
    payment_status: params.paymentStatus,
    // Direct payment mode (pay-at-booking) charges the card now, so stamp the
    // payment time. Pre-auth ('card_saved') is charged later — leave it null.
    ...(params.paymentStatus === "charged"
      ? { payment_at: new Date().toISOString() }
      : {}),
  });
}

/**
 * Insert one payment-info row per booking of a multi-group. Every sibling shares
 * the same saved card (payment method + customer) but carries its own
 * estimated_price so each booking can be charged independently after its
 * treatment. Only the first booking claims the UNIQUE stripe_session_id; the
 * rest store null (Postgres allows multiple NULLs on a UNIQUE column).
 */
async function insertGroupPaymentInfos(
  supabase: ActionContext["supabase"],
  bookingIds: string[],
  priceByBookingId: Map<string, number>,
  shared: {
    customerId: string | null;
    paymentMethodId: string;
    setupIntentId?: string | null;
    paymentIntentId?: string | null;
    sessionId: string;
    cardBrand?: string | null;
    cardLast4?: string | null;
    paymentStatus: "card_saved" | "charged";
  },
): Promise<void> {
  for (let i = 0; i < bookingIds.length; i++) {
    const bookingId = bookingIds[i];
    await insertPaymentInfo(supabase, {
      bookingId,
      customerId: shared.customerId,
      paymentMethodId: shared.paymentMethodId,
      setupIntentId: shared.setupIntentId,
      paymentIntentId: shared.paymentIntentId,
      // Only the first booking owns the session id (UNIQUE); siblings store null.
      sessionId: i === 0 ? shared.sessionId : null,
      cardBrand: shared.cardBrand,
      cardLast4: shared.cardLast4,
      estimatedPrice: priceByBookingId.get(bookingId) ?? 0,
      paymentStatus: shared.paymentStatus,
    });
  }
}

async function atomicReserveSingle(
  supabase: ActionContext["supabase"],
  meta: Record<string, string>,
  hotel: { name: string } | null,
  customerId: string | null,
  totalDuration: number,
  verifiedPrice: number,
  treatmentIds: string[],
): Promise<{ data: string | null; error: Error | null }> {
  // Duo (guest_count > 1): reserve guest_count beds, no therapist yet. Booking
  // stays 'pending' until all guest_count practitioners have accepted (a duo
  // still needing therapists is pending + guest_count > 1).
  const guestCount = Math.max(1, Number(meta.guestCount) || 1);
  return supabase.rpc("reserve_trunk_atomically", {
    _booking_date: meta.bookingDate,
    _booking_time: meta.bookingTime,
    _client_email: meta.clientEmail || null,
    _client_first_name: meta.firstName,
    _client_last_name: meta.lastName,
    _client_note: meta.note || null,
    _customer_id: customerId,
    _duration: totalDuration,
    _hotel_id: meta.hotelId,
    _hotel_name: hotel?.name || "Hotel",
    _language: meta.language || "fr",
    _payment_method: "card",
    _payment_status: "pending",
    _phone: meta.phone,
    _room_number: meta.roomNumber || null,
    _status: "pending",
    _therapist_gender: meta.therapistGender || null,
    _total_price: verifiedPrice,
    _treatment_ids: treatmentIds,
    _guest_count: guestCount,
  });
}

/**
 * Refund a captured charge when booking creation fails after the client was
 * already debited (pay_at_booking mode charges at Checkout, before the booking
 * exists). Without this, a failed reservation left the client charged with no
 * booking — and free to pay again. Best-effort: a failed refund (e.g. already
 * refunded on a retry of the same session) is logged, never fatal.
 */
async function refundChargeAfterFailure(
  stripe: Stripe,
  paymentIntentId: string,
  logPrefix: string,
): Promise<void> {
  try {
    await stripe.refunds.create({ payment_intent: paymentIntentId });
    console.log(`${logPrefix} Refunded PaymentIntent ${paymentIntentId} after booking failure`);
  } catch (refundErr) {
    console.error(
      `${logPrefix} Refund failed for PaymentIntent ${paymentIntentId}:`,
      refundErr instanceof Error ? refundErr.message : refundErr,
    );
  }
}

async function triggerBookingNotifications(
  supabase: ActionContext["supabase"],
  bookingIds: string[],
): Promise<void> {
  await Promise.all(
    bookingIds.flatMap((bookingId) => [
      supabase.functions
        .invoke("trigger-new-booking-notifications", {
          body: { bookingId, notifyAll: true },
        })
        .catch((err: unknown) =>
          console.error(`[CONFIRM-SETUP] Notif error for ${bookingId}:`, err),
        ),
      supabase.functions
        .invoke("notify-admin-new-booking", {
          body: { bookingId },
        })
        .catch((err: unknown) =>
          console.error(
            `[CONFIRM-SETUP] Admin email error for ${bookingId}:`,
            err,
          ),
        ),
    ]),
  );
}

export async function handleConfirmSetupIntent(
  ctx: ActionContext,
): Promise<Response> {
  const { body, supabase } = ctx;
  let stripe = ctx.stripe;
  const { sessionId } = body as { sessionId?: string };

  if (!sessionId) throw new Error("Missing sessionId");

  // The session was created by the venue's Stripe key; if the caller did not
  // pass hotelId we may have used the global key. Try to read metadata.hotelId
  // and re-resolve with the venue key when possible.
  let session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent", "setup_intent.payment_method", "payment_intent", "payment_intent.payment_method"],
  });
  const meta = session.metadata || {};

  if (meta.hotelId && meta.hotelId !== ctx.hotelId) {
    const resolved = await getStripeForVenue(supabase, meta.hotelId);
    stripe = resolved.client;
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent", "setup_intent.payment_method", "payment_intent", "payment_intent.payment_method"],
    });
  }

  const { data: existingPaymentInfo } = await supabase
    .from("booking_payment_infos")
    .select("booking_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (existingPaymentInfo) {
    console.log(
      "[CONFIRM-SETUP] Réservation déjà existante pour cette session :",
      existingPaymentInfo.booking_id,
    );
    if (meta.isMulti === "1" && meta.groupId) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("booking_group_id", meta.groupId);
      const ids = (groupBookings || []).map((b: { id: string }) => b.id);
      return jsonResponse({
        success: true,
        bookingId: existingPaymentInfo.booking_id,
        bookingIds: ids,
      });
    }
    return jsonResponse({
      success: true,
      bookingId: existingPaymentInfo.booking_id,
    });
  }

  if (!meta.hotelId) {
    throw new Error("Données de réservation introuvables dans la session Stripe.");
  }

  // Shared across both multi and single paths
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  // 'pay_at_booking' sessions carry a payment_intent (immediate charge); pre-authorization
  // sessions carry a setup_intent (card saved, charged later).
  const payAtBooking =
    meta.paymentMode === "pay_at_booking" || session.mode === "payment";
  const setupIntent = session.setup_intent as Stripe.SetupIntent | null;
  const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;

  // Booking status is 'paid' when charged at booking, otherwise 'card_saved' (pre-auth).
  const bookingPaymentStatus = payAtBooking ? "paid" : "card_saved";
  const infoPaymentStatus: "card_saved" | "charged" = payAtBooking
    ? "charged"
    : "card_saved";
  const paymentIntentId = payAtBooking ? paymentIntent?.id ?? null : null;

  const intentPaymentMethod = payAtBooking
    ? paymentIntent?.payment_method
    : setupIntent?.payment_method;
  const paymentMethodId =
    typeof intentPaymentMethod === "string"
      ? intentPaymentMethod
      : (intentPaymentMethod as Stripe.PaymentMethod)?.id;
  const paymentMethodCard =
    typeof intentPaymentMethod !== "string"
      ? (intentPaymentMethod as Stripe.PaymentMethod)?.card
      : null;

  console.log("[CONFIRM-SETUP] session state", {
    sessionStatus: session.status,
    payAtBooking,
    setupIntentId: setupIntent?.id,
    paymentIntentId,
    paymentMethodType: typeof intentPaymentMethod,
    paymentMethodId,
  });

  let resolvedPaymentMethodId = paymentMethodId;
  if (!resolvedPaymentMethodId && payAtBooking && paymentIntent?.id) {
    console.warn("[CONFIRM-SETUP] paymentMethodId null — fetching PaymentIntent directly");
    const fullPI = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ["payment_method"],
    });
    resolvedPaymentMethodId = typeof fullPI.payment_method === "string"
      ? fullPI.payment_method
      : (fullPI.payment_method as Stripe.PaymentMethod)?.id;
    console.log("[CONFIRM-SETUP] resolved paymentMethodId from PI:", resolvedPaymentMethodId);
  } else if (setupIntent?.id && !resolvedPaymentMethodId) {
    console.warn("[CONFIRM-SETUP] paymentMethodId null — fetching SetupIntent directly");
    const fullSI = await stripe.setupIntents.retrieve(setupIntent.id, {
      expand: ["payment_method"],
    });
    resolvedPaymentMethodId = typeof fullSI.payment_method === "string"
      ? fullSI.payment_method
      : (fullSI.payment_method as Stripe.PaymentMethod)?.id;
    console.log("[CONFIRM-SETUP] resolved paymentMethodId from SI:", resolvedPaymentMethodId);
  }

  // From here on the client has already been charged (pay_at_booking). If any
  // step of the reservation throws before a booking row exists, refund the
  // charge so we never keep money without a booking. `bookingCreated` flips true
  // once the booking row(s) exist — a later failure (notifications, payment-info
  // write) must NOT trigger a refund, since the booking stands and the charge is
  // legitimately owed.
  let bookingCreated = false;
  try {
  // ── MULTI-BOOKING PATH ───────────────────────────────────────────
  if (meta.isMulti === "1") {
    let multiBookingIds: string[] = [];
    try {
      multiBookingIds = JSON.parse(meta.bookingIds || "[]");
    } catch {
      throw new Error("bookingIds metadata invalide");
    }

    const customerId = await resolveCustomer(
      supabase,
      meta.clientEmail,
      stripeCustomerId,
      meta.firstName,
      meta.lastName,
      meta.phone,
    );

    // ── Multi-no-hold: hold was disabled — no draft bookings exist.
    // Create N atomic reservations now using per-slot metadata arrays.
    if (!multiBookingIds.length && meta.booking_dates) {
      const dates = JSON.parse(meta.booking_dates) as string[];
      const times = JSON.parse(meta.booking_times || "[]") as string[];
      const slotTreatmentIds = JSON.parse(meta.treatment_ids_per_slot || "[]") as string[];
      const slotVariantIds = JSON.parse(meta.variant_ids_per_slot || "[]") as string[];
      const slotDurations = JSON.parse(meta.durations_per_slot || "[]") as number[];
      const slotQuantities = JSON.parse(meta.quantities_per_slot || "[]") as number[];
      const slotGuestCounts = JSON.parse(meta.guest_counts_per_slot || "[]") as number[];
      const multiGroupId = meta.groupId || crypto.randomUUID();

      const { data: venueData } = await supabase
        .from("hotels")
        .select("name, opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent")
        .eq("id", meta.hotelId)
        .maybeSingle();

      const uniqueTreatmentIds = [...new Set(slotTreatmentIds.filter(Boolean))];
      const uniqueVariantIds = [...new Set(slotVariantIds.filter((v: string) => v))];
      const [{ data: slotTreatmentsData }, { data: slotVariantsData }] = await Promise.all([
        uniqueTreatmentIds.length > 0
          ? supabase.from("treatment_menus").select("id, price").in("id", uniqueTreatmentIds)
          : Promise.resolve({ data: [] as { id: string; price: number }[] }),
        uniqueVariantIds.length > 0
          ? supabase.from("treatment_variants").select("id, price").in("id", uniqueVariantIds)
          : Promise.resolve({ data: [] as { id: string; price: number }[] }),
      ]);
      const txPriceMap = new Map((slotTreatmentsData || []).map((t: { id: string; price: number }) => [t.id, t.price]));
      const varPriceMap = new Map((slotVariantsData || []).map((v: { id: string; price: number }) => [v.id, v.price]));

      const slotCreatedIds: string[] = [];
      const slotPriceById = new Map<string, number>();
      for (let i = 0; i < dates.length; i++) {
        const slotVariantId = slotVariantIds[i] || null;
        const qty = slotQuantities[i] || 1;
        const baseUnitPrice = slotVariantId
          ? Number(varPriceMap.get(slotVariantId) ?? 0)
          : Number(txPriceMap.get(slotTreatmentIds[i]) ?? 0);
        const slotSurcharge = computeOutOfHoursSurcharge(times[i], baseUnitPrice * qty, venueData || {});

        const { data: newId, error: rpcError } = await supabase.rpc("reserve_trunk_atomically", {
          _booking_date: dates[i],
          _booking_time: times[i],
          _client_email: meta.clientEmail || null,
          _client_first_name: meta.firstName,
          _client_last_name: meta.lastName,
          _client_note: meta.note || null,
          _customer_id: customerId,
          _duration: slotDurations[i] || 60,
          _hotel_id: meta.hotelId,
          _hotel_name: venueData?.name || "Hotel",
          _language: meta.language || "fr",
          _payment_method: "card",
          _payment_status: "pending",
          _phone: meta.phone,
          _room_number: meta.roomNumber || null,
          _status: "pending",
          _therapist_gender: meta.therapistGender || null,
          _total_price: slotSurcharge.totalWithSurcharge,
          _treatment_ids: [slotTreatmentIds[i]].filter(Boolean),
          _guest_count: slotGuestCounts[i] || 1,
        });

        if (rpcError || !newId) {
          if (slotCreatedIds.length > 0) {
            await supabase.from("bookings").delete().in("id", slotCreatedIds);
          }
          throw new Error(`Un créneau (${dates[i]} ${times[i]}) vient d'être pris. Veuillez choisir un autre horaire.`);
        }

        await supabase.from("bookings").update({
          booking_group_id: multiGroupId,
          therapist_id: null,
          source: "client",
          is_out_of_hours: slotSurcharge.isOutOfHours,
          surcharge_amount: slotSurcharge.surchargeAmount,
          payment_status: bookingPaymentStatus,
        }).eq("id", newId);

        await supabase.from("booking_treatments").insert({
          booking_id: newId,
          treatment_id: slotTreatmentIds[i],
          variant_id: slotVariantId,
        });

        slotCreatedIds.push(newId);
        slotPriceById.set(newId, slotSurcharge.totalWithSurcharge);
      }
      bookingCreated = true;

      if (resolvedPaymentMethodId && (setupIntent || paymentIntent)) {
        // One payment-info row per booking so each is chargeable independently
        // after its treatment (they share the same saved card).
        await insertGroupPaymentInfos(supabase, slotCreatedIds, slotPriceById, {
          customerId,
          paymentMethodId: resolvedPaymentMethodId,
          setupIntentId: payAtBooking ? null : setupIntent?.id,
          paymentIntentId,
          sessionId,
          cardBrand: paymentMethodCard?.brand,
          cardLast4: paymentMethodCard?.last4,
          paymentStatus: infoPaymentStatus,
        });
      }

      await triggerBookingNotifications(supabase, slotCreatedIds);

      await tryMarkCheckoutIntentConverted(supabase, meta.checkoutIntentId, slotCreatedIds[0], "[CONFIRM-SETUP]");

      return jsonResponse({ success: true, bookingId: slotCreatedIds[0], bookingIds: slotCreatedIds });
    }

    if (!multiBookingIds.length) {
      throw new Error("Aucun bookingId dans les metadata multi.");
    }

    // ── Multi-with-hold: N drafts exist — promote them to 'pending'.
    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        client_first_name: meta.firstName,
        client_last_name: meta.lastName,
        client_email: meta.clientEmail || null,
        phone: meta.phone,
        room_number: meta.roomNumber || null,
        client_note: meta.note || null,
        status: "pending",
        source: "client",
        payment_method: "card",
        payment_status: bookingPaymentStatus,
        customer_id: customerId,
      })
      .in("id", multiBookingIds)
      .eq("hotel_id", meta.hotelId)
      .eq("status", "awaiting_payment");

    if (updErr) {
      throw new Error(
        `Erreur lors de la promotion des drafts multi : ${updErr.message}`,
      );
    }
    bookingCreated = true;

    // One payment-info row per booking (each carries its own price) so every
    // booking of the group is chargeable independently after its treatment.
    // The saved card is shared; only the first booking claims the UNIQUE
    // stripe_session_id (siblings store null).
    if (resolvedPaymentMethodId && (setupIntent || paymentIntent)) {
      const { data: groupPriceRows } = await supabase
        .from("bookings")
        .select("id, total_price")
        .in("id", multiBookingIds);
      const priceByBookingId = new Map<string, number>(
        (groupPriceRows || []).map((b: { id: string; total_price: number | null }) => [
          b.id,
          Number(b.total_price) || 0,
        ]),
      );
      await insertGroupPaymentInfos(supabase, multiBookingIds, priceByBookingId, {
        customerId,
        paymentMethodId: resolvedPaymentMethodId,
        setupIntentId: payAtBooking ? null : setupIntent?.id,
        paymentIntentId,
        sessionId,
        cardBrand: paymentMethodCard?.brand,
        cardLast4: paymentMethodCard?.last4,
        paymentStatus: infoPaymentStatus,
      });
    }

    await triggerBookingNotifications(supabase, multiBookingIds);

    await tryMarkCheckoutIntentConverted(supabase, meta.checkoutIntentId, multiBookingIds[0], "[CONFIRM-SETUP]");

    return jsonResponse({
      success: true,
      bookingId: multiBookingIds[0],
      bookingIds: multiBookingIds,
    });
  }

  // ── SINGLE BOOKING PATH ──────────────────────────────────────────
  const treatmentIds = JSON.parse(meta.treatmentIds || "[]");

  // treatmentsPayload carries per-line quantity/variant. A cart line can have
  // quantity > 1 (same treatment booked N times) — price, duration and the
  // booking_treatments rows must all scale with it. Fall back to one unit per id
  // for older sessions whose metadata predates the quantity field.
  const treatmentsPayload: TreatmentLine[] = JSON.parse(meta.treatmentsPayload || "[]");
  const pricingLines: TreatmentLine[] = treatmentsPayload.length > 0
    ? treatmentsPayload
    : (treatmentIds as string[]).map((id) => ({ treatmentId: id, quantity: 1 }));

  // Duo (guest_count > 1): the legs run simultaneously → slot duration = longest leg
  // (a soin plus the add-ons hanging off it). Solo: sum. Both stay 'pending' until
  // fully staffed.
  const guestCount = Math.max(1, Number(meta.guestCount) || 1);
  const isDuo = guestCount > 1;

  const { data: treatments } = await supabase
    .from("treatment_menus")
    .select("id, price, duration, is_addon, category")
    .in("id", treatmentIds);
  const priceById = new Map<string, number>(
    (treatments || []).map((t: { id: string; price: number }) => [t.id, t.price || 0]),
  );
  const durationById = new Map<string, number>(
    (treatments || []).map((t: { id: string; duration: number }) => [t.id, t.duration || 0]),
  );

  const addonTreatmentIds = await fetchAddonTreatmentIds(supabase, meta.hotelId, treatments || []);
  const isAddonLine = (treatmentId: string) => addonTreatmentIds.has(treatmentId);
  const durationOfLine = (line: TreatmentLine) => durationById.get(line.treatmentId) || 0;

  let basePrice = 0;
  for (const line of pricingLines) {
    const qty = Math.max(1, Number(line.quantity) || 1);
    basePrice += (priceById.get(line.treatmentId) || 0) * qty;
  }
  const totalDuration = computeSlotDuration(pricingLines, isDuo, durationOfLine, isAddonLine) || 30;

  const { data: hotel } = await supabase
    .from("hotels")
    .select(
      "name, opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent",
    )
    .eq("id", meta.hotelId)
    .maybeSingle();

  const surcharge = computeOutOfHoursSurcharge(
    meta.bookingTime || "",
    basePrice,
    hotel || {},
  );
  const verifiedPrice = surcharge.totalWithSurcharge;

  const customerId = await resolveCustomer(
    supabase,
    meta.clientEmail,
    stripeCustomerId,
    meta.firstName,
    meta.lastName,
    meta.phone,
  );

  let bookingId: string;

  if (meta.draftBookingId) {
    const { data: draftBooking, error: draftFetchError } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", meta.draftBookingId)
      .eq("hotel_id", meta.hotelId)
      .eq("status", "awaiting_payment")
      .single();

    if (draftFetchError || !draftBooking) {
      console.warn("[CONFIRM-SETUP] Draft expired, falling back to atomic reserve");
      const { data: fallbackId, error: fallbackError } = await atomicReserveSingle(
        supabase, meta, hotel, customerId, totalDuration, verifiedPrice, treatmentIds,
      );
      if (fallbackError)
        throw new Error(
          `Désolé, ce créneau vient tout juste d'être réservé (${fallbackError.message})`,
        );
      if (!fallbackId)
        throw new Error(
          "Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.",
        );
      bookingId = fallbackId;
      await supabase.from("bookings").update({
        therapist_id: null,
        source: "client",
        is_out_of_hours: surcharge.isOutOfHours,
        surcharge_amount: surcharge.surchargeAmount,
        payment_status: bookingPaymentStatus,
      }).eq("id", bookingId);
    } else {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          client_first_name: meta.firstName,
          client_last_name: meta.lastName,
          client_email: meta.clientEmail || null,
          phone: meta.phone,
          room_number: meta.roomNumber || null,
          client_note: meta.note || null,
          status: "pending",
          source: "client",
          payment_method: "card",
          payment_status: bookingPaymentStatus,
          total_price: verifiedPrice,
          customer_id: customerId,
          therapist_id: null,
          is_out_of_hours: surcharge.isOutOfHours,
          surcharge_amount: surcharge.surchargeAmount,
        })
        .eq("id", meta.draftBookingId);

      if (updateError)
        throw new Error(
          `Erreur lors de la mise à jour de la réservation : ${updateError.message}`,
        );
      bookingId = meta.draftBookingId;
      console.log("[CONFIRM-SETUP] Draft booking updated:", bookingId);
    }
  } else {
    const { data: newBookingId, error: rpcError } = await atomicReserveSingle(
      supabase, meta, hotel, customerId, totalDuration, verifiedPrice, treatmentIds,
    );

    if (rpcError) {
      console.error(
        "[CONFIRM-SETUP] Erreur RPC lors de la réservation :",
        rpcError,
      );
      throw new Error(
        `Désolé, ce créneau vient tout juste d'être réservé ou une erreur est survenue (${rpcError.message})`,
      );
    }
    if (!newBookingId)
      throw new Error(
        "Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.",
      );

    bookingId = newBookingId;
    await supabase.from("bookings").update({
      therapist_id: null,
      source: "client",
      is_out_of_hours: surcharge.isOutOfHours,
      surcharge_amount: surcharge.surchargeAmount,
      payment_status: bookingPaymentStatus,
    }).eq("id", bookingId);
  }

  if (!bookingId) {
    throw new Error(
      "Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.",
    );
  }
  bookingCreated = true;

  if (treatmentIds && treatmentIds.length > 0) {
    if (meta.draftBookingId) {
      await supabase
        .from("booking_treatments")
        .delete()
        .eq("booking_id", bookingId);
    }

    // One row per booked unit — a line with quantity > 1 yields N rows. Add-ons are
    // inserted after the base soins so they can point at the soin they extend.
    if (pricingLines.length > 0) {
      const treatmentsError = await insertBookingTreatmentLines(
        supabase,
        bookingId,
        pricingLines,
        isAddonLine,
      );
      if (treatmentsError) {
        console.error(
          "[CONFIRM-SETUP] booking_treatments insert error:",
          treatmentsError,
        );
      }
    }
  }

  // Apply gift card deduction if present in metadata
  const giftAmountCents = meta.giftAmountCents ? parseInt(meta.giftAmountCents, 10) : 0;
  const giftCustomerBundleId = meta.giftAmountCustomerBundleId || null;
  let netPrice = verifiedPrice;

  if (giftAmountCents > 0 && giftCustomerBundleId) {
    const { error: giftError } = await supabase.rpc("use_gift_amount", {
      _customer_bundle_id: giftCustomerBundleId,
      _booking_id: bookingId,
      _amount_cents: giftAmountCents,
    });
    if (giftError) {
      console.error("[CONFIRM-SETUP] use_gift_amount failed (non-blocking):", giftError.message);
    } else {
      netPrice = Math.max(0, verifiedPrice - giftAmountCents / 100);
      console.log("[CONFIRM-SETUP] Gift applied:", giftAmountCents, "cents. Net price:", netPrice);
    }
  }

  if (resolvedPaymentMethodId && (setupIntent || paymentIntent)) {
    await insertPaymentInfo(supabase, {
      bookingId,
      customerId,
      paymentMethodId: resolvedPaymentMethodId,
      setupIntentId: payAtBooking ? null : setupIntent?.id,
      paymentIntentId,
      sessionId,
      cardBrand: paymentMethodCard?.brand,
      cardLast4: paymentMethodCard?.last4,
      estimatedPrice: netPrice,
      paymentStatus: infoPaymentStatus,
    });
  }

  await triggerBookingNotifications(supabase, [bookingId]);

  await tryMarkCheckoutIntentConverted(supabase, meta.checkoutIntentId, bookingId, "[CONFIRM-SETUP]");

  return jsonResponse({ success: true, bookingId });
  } catch (err) {
    // Reservation failed after the client was charged (pay_at_booking) and no
    // booking row was created → refund so we never keep money without a booking.
    if (payAtBooking && paymentIntent?.id && !bookingCreated) {
      await refundChargeAfterFailure(stripe, paymentIntent.id, "[CONFIRM-SETUP]");
    }
    throw err;
  }
}
