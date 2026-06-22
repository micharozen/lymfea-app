import { isInBlockedSlot } from "../../_shared/blocked-slots.ts";
import { computeOutOfHoursSurcharge } from "../../_shared/surcharge.ts";
import { resolveVerifiedPmsGuest } from "../../_shared/pms-verify.ts";
import type { ActionContext } from "../index.ts";

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

export async function handleCreateSetupIntent(
  ctx: ActionContext,
): Promise<Response> {
  const { req, body, supabase, stripe } = ctx;
  const {
    bookingData,
    clientData,
    treatmentIds,
    treatments: treatmentsPayload,
    hotelId,
    language,
    therapistGender,
    draftBookingId,
    giftAmountUsage,
    guestCount,
    isMulti,
    groupId,
    bookingIds,
    slots,
  } = body as Record<string, any>;

  type SlotPayload = { date: string; time: string; treatmentId: string; variantId?: string | null; duration?: number; quantity?: number; guestCount?: number };
  const slotsArr: SlotPayload[] = Array.isArray(slots) ? (slots as SlotPayload[]) : [];

  // Multi-with-hold: bookingIds already created. Multi-no-hold: slotsArr carries the schedule.
  const isMultiBooking = !!isMulti && (
    (Array.isArray(bookingIds) && bookingIds.length > 1) ||
    slotsArr.length > 1
  );

  // When hold is disabled the front has no groupId — generate one server-side.
  const effectiveGroupId = isMultiBooking
    ? (groupId || (slotsArr.length > 0 ? crypto.randomUUID() : ""))
    : "";

  if (!bookingData || !clientData || !hotelId) {
    throw new Error("Missing required data");
  }

  const safeTreatmentsPayload =
    treatmentsPayload || (treatmentIds || []).map((id: string) => ({ treatmentId: id }));

  const effectiveTreatmentIds = safeTreatmentsPayload
    .map((t: any) => t.treatmentId || t.id)
    .filter(Boolean);

  if (effectiveTreatmentIds.length === 0) {
    throw new Error("At least one treatment is required");
  }

  const { data: treatments, error: treatmentsError } = await supabase
    .from("treatment_menus")
    .select("id, name, price, hotel_id, status, duration")
    .in("id", effectiveTreatmentIds);

  if (treatmentsError || !treatments || treatments.length === 0) {
    throw new Error(
      "Failed to fetch treatments from database. Your cart might contain outdated items.",
    );
  }

  const foundTreatmentIds = new Set(treatments.map((t: any) => t.id));
  const missingTreatments = effectiveTreatmentIds.filter(
    (id: string) => !foundTreatmentIds.has(id),
  );
  if (missingTreatments.length > 0) {
    throw new Error(
      "Some treatments are no longer available in our catalog. Please refresh your cart.",
    );
  }

  const ACTIVE_STATUSES = ["Actif", "active", "Active"];
  const invalidTreatments = treatments.filter(
    (t: any) =>
      (t.hotel_id !== null && t.hotel_id !== hotelId) ||
      !ACTIVE_STATUSES.includes(t.status),
  );
  if (invalidTreatments.length > 0) {
    throw new Error(
      "Some selected treatments are currently inactive or unavailable for this venue.",
    );
  }

  const variantIds = safeTreatmentsPayload
    .map((t: any) => t.variantId)
    .filter(Boolean);
  let variants: any[] = [];
  if (variantIds.length > 0) {
    const { data: vData, error: vError } = await supabase
      .from("treatment_variants")
      .select("id, price, duration")
      .in("id", variantIds);
    if (vError) throw new Error("Failed to fetch treatment variants.");
    variants = vData || [];
  }

  let rawTotalPrice = 0;
  let totalDuration = 0;
  for (const tPayload of safeTreatmentsPayload) {
    const baseTreatment = treatments.find(
      (t: any) => t.id === (tPayload.treatmentId || tPayload.id),
    );
    if (!baseTreatment) continue;
    if (tPayload.variantId) {
      const variant = variants.find((v: any) => v.id === tPayload.variantId);
      if (!variant) {
        throw new Error("A requested treatment variant is no longer available.");
      }
      rawTotalPrice += variant.price ?? baseTreatment.price ?? 0;
      totalDuration += variant.duration ?? baseTreatment.duration ?? 30;
    } else {
      rawTotalPrice += baseTreatment.price ?? 0;
      totalDuration += baseTreatment.duration ?? 30;
    }
  }

  const giftDeductionEuros = giftAmountUsage?.amountCents
    ? Math.round(giftAmountUsage.amountCents / 100)
    : 0;
  const verifiedTotalPrice = Math.max(rawTotalPrice - giftDeductionEuros, 0);

  if (verifiedTotalPrice <= 0 && !giftAmountUsage) {
    throw new Error(`Invalid total price calculated (Total was ${rawTotalPrice}€).`);
  }

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select(
      "slug, currency, name, offert, pms_guest_lookup_enabled, opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent",
    )
    .eq("id", hotelId)
    .maybeSingle();

  if (hotelError || !hotel) {
    throw new Error("Hotel not found");
  }
  if (hotel.offert) {
    throw new Error("Ce lieu propose actuellement des soins offerts.");
  }

  // PMS-verified hotel guest paying by card: re-verify room + last name server-side
  // and pull the contact details from the PMS. The visitor never typed an email/phone
  // (they stay empty client-side), so we resolve them here for Stripe + the booking.
  if (clientData.pmsVerified && (hotel as any).pms_guest_lookup_enabled) {
    const guest = await resolveVerifiedPmsGuest(
      supabase,
      hotelId,
      clientData.roomNumber || "",
      clientData.lastName || "",
    );
    if (!guest) {
      return jsonResponse({ error: "PMS_VERIFICATION_FAILED" }, 400);
    }
    clientData.firstName = guest.firstName || clientData.firstName;
    clientData.lastName = guest.lastName || clientData.lastName;
    clientData.email = guest.email || clientData.email;
    clientData.phone = guest.phone || clientData.phone;
  }

  const surcharge = computeOutOfHoursSurcharge(
    bookingData.time,
    verifiedTotalPrice,
    hotel,
  );
  const finalTotalPrice = surcharge.totalWithSurcharge;

  // Multi-booking: drafts already exist and hold the slots; skip the blocked-slot
  // check (which is for the single bookingData.date/time only).
  if (
    !isMultiBooking &&
    await isInBlockedSlot(
      supabase,
      hotelId,
      bookingData.date,
      bookingData.time,
      totalDuration,
    )
  ) {
    return jsonResponse({ error: "BLOCKED_SLOT" }, 400);
  }

  let stripeCustomerId: string;
  const existingCustomers = await stripe.customers.list({
    email: clientData.email,
    limit: 1,
  });
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

  const customerPayload = {
    phone: clientData.phone,
    email: clientData.email,
    first_name: clientData.firstName,
    last_name: clientData.lastName,
  };
  const { data: existingByStripe } = await supabase
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (existingByStripe) {
    const { error } = await supabase
      .from("customers")
      .update(customerPayload)
      .eq("id", existingByStripe.id);
    if (error) console.error("[CREATE-SETUP-INTENT] Erreur Update Customer:", error);
  } else {
    const { error } = await supabase
      .from("customers")
      .upsert({ ...customerPayload, stripe_customer_id: stripeCustomerId }, { onConflict: "phone" });
    if (error) console.error("[CREATE-SETUP-INTENT] Erreur Upsert Customer:", error);
  }

  const origin = req.headers.get("origin") || "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    locale: language === "en" ? "en" : "fr",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    success_url: `${origin}/client/${hotel.slug ?? hotelId}/confirmation/setup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/client/${hotel.slug ?? hotelId}/payment`,
    metadata: {
      hotelId: hotelId,
      bookingDate: bookingData.date,
      bookingTime: bookingData.time,
      firstName: clientData.firstName,
      lastName: clientData.lastName,
      clientEmail: clientData.email,
      phone: clientData.phone,
      roomNumber: clientData.roomNumber || "",
      note: clientData.note || "",
      treatmentIds: JSON.stringify(effectiveTreatmentIds),
      treatmentsPayload: JSON.stringify(safeTreatmentsPayload),
      language: language || "fr",
      therapistGender: therapistGender || "",
      draftBookingId: draftBookingId || "",
      guestCount: guestCount ? String(guestCount) : "1",
      ...(giftAmountUsage
        ? {
            giftAmountCustomerBundleId: giftAmountUsage.customerBundleId,
            giftAmountCents: String(giftAmountUsage.amountCents),
          }
        : {}),
      isOutOfHours: surcharge.isOutOfHours ? "1" : "0",
      surchargeAmount: String(surcharge.surchargeAmount),
      surchargePercent: String(surcharge.surchargePercent),
      verifiedTotalPrice: String(finalTotalPrice),
      isMulti: isMultiBooking ? "1" : "0",
      groupId: effectiveGroupId,
      bookingIds: isMultiBooking && Array.isArray(bookingIds) && bookingIds.length > 0 ? JSON.stringify(bookingIds) : "",
      // Multi-no-hold: store per-slot data so confirm-setup-intent can create N bookings.
      ...(isMultiBooking && slotsArr.length > 0 && (!bookingIds || bookingIds.length === 0) ? {
        booking_dates: JSON.stringify(slotsArr.map((s: SlotPayload) => s.date)),
        booking_times: JSON.stringify(slotsArr.map((s: SlotPayload) => s.time)),
        treatment_ids_per_slot: JSON.stringify(slotsArr.map((s: SlotPayload) => s.treatmentId)),
        variant_ids_per_slot: JSON.stringify(slotsArr.map((s: SlotPayload) => s.variantId || "")),
        durations_per_slot: JSON.stringify(slotsArr.map((s: SlotPayload) => s.duration || 60)),
        quantities_per_slot: JSON.stringify(slotsArr.map((s: SlotPayload) => s.quantity || 1)),
        guest_counts_per_slot: JSON.stringify(slotsArr.map((s: SlotPayload) => s.guestCount || 1)),
      } : {}),
    },
  });

  return jsonResponse({ url: session.url, sessionId: session.id });
}
