import type Stripe from "https://esm.sh/stripe@18.5.0";
import { computeOutOfHoursSurcharge } from "../../_shared/surcharge.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
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
    expand: ["setup_intent", "setup_intent.payment_method"],
  });
  const meta = session.metadata || {};

  if (meta.hotelId && meta.hotelId !== ctx.hotelId) {
    const resolved = await getStripeForVenue(supabase, meta.hotelId);
    stripe = resolved.client;
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent", "setup_intent.payment_method"],
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
    return jsonResponse({
      success: true,
      bookingId: existingPaymentInfo.booking_id,
    });
  }

  if (!meta.hotelId) {
    throw new Error("Données de réservation introuvables dans la session Stripe.");
  }

  const treatmentIds = JSON.parse(meta.treatmentIds || "[]");

  const { data: treatments } = await supabase
    .from("treatment_menus")
    .select("price, duration")
    .in("id", treatmentIds);
  const basePrice = (treatments || []).reduce(
    (sum: number, t: any) => sum + (t.price || 0),
    0,
  );
  const totalDuration =
    (treatments || []).reduce(
      (sum: number, t: any) => sum + (t.duration || 0),
      0,
    ) || 30;

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

  let customerId: string | null = null;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (meta.clientEmail) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("email", meta.clientEmail)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (stripeCustomerId) {
        await supabase
          .from("customers")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", customerId);
      }
    } else {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({
          first_name: meta.firstName,
          last_name: meta.lastName,
          email: meta.clientEmail,
          phone: meta.phone,
          stripe_customer_id: stripeCustomerId,
        })
        .select("id")
        .single();
      if (newCustomer) customerId = newCustomer.id;
    }
  }

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
      const { data: fallbackId, error: fallbackError } = await supabase.rpc(
        "reserve_trunk_atomically",
        {
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
        },
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
          payment_method: "card",
          payment_status: "pending",
          total_price: verifiedPrice,
          customer_id: customerId,
          therapist_id: null,
        })
        .eq("id", meta.draftBookingId);

      if (updateError)
        throw new Error(
          `Erreur lors de la mise à jour de la réservation : ${updateError.message}`,
        );
      bookingId = meta.draftBookingId;
      console.log("[CONFIRM-SETUP] Draft booking updated:", bookingId);

      await supabase
        .from("bookings")
        .update({
          is_out_of_hours: surcharge.isOutOfHours,
          surcharge_amount: surcharge.surchargeAmount,
        })
        .eq("id", bookingId);
    }
  } else {
    const { data: newBookingId, error: rpcError } = await supabase.rpc(
      "reserve_trunk_atomically",
      {
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
      },
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
    await supabase
      .from("bookings")
      .update({
        therapist_id: null,
        is_out_of_hours: surcharge.isOutOfHours,
        surcharge_amount: surcharge.surchargeAmount,
      })
      .eq("id", bookingId);
  }

  if (!bookingId) {
    throw new Error(
      "Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.",
    );
  }

  await supabase
    .from("bookings")
    .update({ therapist_id: null })
    .eq("id", bookingId);

  if (treatmentIds && treatmentIds.length > 0) {
    if (meta.draftBookingId) {
      await supabase
        .from("booking_treatments")
        .delete()
        .eq("booking_id", bookingId);
    }

    const treatmentInserts = treatmentIds.map((id: string) => ({
      booking_id: bookingId,
      treatment_id: id,
      variant_id: null,
    }));

    if (treatmentInserts.length > 0) {
      const { error: treatmentsError } = await supabase
        .from("booking_treatments")
        .insert(treatmentInserts);
      if (treatmentsError) {
        console.error(
          "[CONFIRM-SETUP] booking_treatments insert error:",
          treatmentsError,
        );
      }
    }
  }

  const setupIntent = session.setup_intent as Stripe.SetupIntent;
  const paymentMethodId =
    typeof setupIntent?.payment_method === "string"
      ? setupIntent.payment_method
      : (setupIntent?.payment_method as Stripe.PaymentMethod)?.id;
  const paymentMethodCard =
    typeof setupIntent?.payment_method !== "string"
      ? (setupIntent?.payment_method as Stripe.PaymentMethod)?.card
      : null;

  if (paymentMethodId && setupIntent) {
    await supabase.from("booking_payment_infos").insert({
      booking_id: bookingId,
      customer_id: customerId,
      stripe_payment_method_id: paymentMethodId,
      stripe_setup_intent_id: setupIntent.id,
      stripe_session_id: sessionId,
      card_brand: paymentMethodCard?.brand || null,
      card_last4: paymentMethodCard?.last4 || null,
      estimated_price: verifiedPrice,
      payment_status: "card_saved",
    });
  }

  return jsonResponse({ success: true, bookingId });
}
