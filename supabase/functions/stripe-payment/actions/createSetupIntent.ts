import { isInBlockedSlot } from "../../_shared/blocked-slots.ts";
import { computeOutOfHoursSurcharge } from "../../_shared/surcharge.ts";
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
  } = body as Record<string, any>;

  const isMultiBooking = !!isMulti && Array.isArray(bookingIds) && bookingIds.length > 1;

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
      "slug, currency, name, offert, opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent",
    )
    .eq("id", hotelId)
    .maybeSingle();

  if (hotelError || !hotel) {
    throw new Error("Hotel not found");
  }
  if (hotel.offert) {
    throw new Error("Ce lieu propose actuellement des soins offerts.");
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

  const { error: upsertError } = await supabase.from("customers").upsert(
    {
      phone: clientData.phone,
      email: clientData.email,
      first_name: clientData.firstName,
      last_name: clientData.lastName,
      stripe_customer_id: stripeCustomerId,
    },
    { onConflict: "phone" },
  );
  if (upsertError) {
    console.error("[CREATE-SETUP-INTENT] Erreur Upsert Customer:", upsertError);
  }

  const origin = req.headers.get("origin") || "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
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
      groupId: isMultiBooking ? String(groupId || "") : "",
      bookingIds: isMultiBooking ? JSON.stringify(bookingIds) : "",
    },
  });

  return jsonResponse({ url: session.url, sessionId: session.id });
}
