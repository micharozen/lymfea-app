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

async function triggerBookingNotifications(
  supabase: ActionContext["supabase"],
  bookingIds: string[],
): Promise<void> {
  await Promise.all(
    bookingIds.map((bookingId) =>
      supabase.functions
        .invoke("trigger-new-booking-notifications", {
          body: { bookingId, notifyAll: true },
        })
        .catch((err: unknown) =>
          console.error(`[CONFIRM-SETUP] Notif error for ${bookingId}:`, err),
        ),
    ),
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
    // For multi-booking, return all sibling bookings sharing the same group.
    if (meta.isMulti === "1" && meta.groupId) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("booking_group_id", meta.groupId);
      const ids = (groupBookings || []).map((b: any) => b.id);
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

  // ── MULTI-BOOKING PATH ───────────────────────────────────────────
  if (meta.isMulti === "1") {
    let multiBookingIds: string[] = [];
    try {
      multiBookingIds = JSON.parse(meta.bookingIds || "[]");
    } catch {
      throw new Error("bookingIds metadata invalide");
    }

    // Resolve/create customer (needed by both sub-paths below).
    let multiCustomerId: string | null = null;
    const multiStripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    if (meta.clientEmail) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("email", meta.clientEmail)
        .maybeSingle();
      if (existing) {
        multiCustomerId = existing.id;
        if (multiStripeCustomerId) {
          await supabase
            .from("customers")
            .update({ stripe_customer_id: multiStripeCustomerId })
            .eq("id", multiCustomerId);
        }
      } else {
        const { data: created } = await supabase
          .from("customers")
          .insert({
            first_name: meta.firstName,
            last_name: meta.lastName,
            email: meta.clientEmail,
            phone: meta.phone,
            stripe_customer_id: multiStripeCustomerId,
          })
          .select("id")
          .single();
        if (created) multiCustomerId = created.id;
      }
    }

    const multiSetupIntent = session.setup_intent as Stripe.SetupIntent;
    const multiPaymentMethodId =
      typeof multiSetupIntent?.payment_method === "string"
        ? multiSetupIntent.payment_method
        : (multiSetupIntent?.payment_method as Stripe.PaymentMethod)?.id;
    const multiCard =
      typeof multiSetupIntent?.payment_method !== "string"
        ? (multiSetupIntent?.payment_method as Stripe.PaymentMethod)?.card
        : null;

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

      const { data: noHoldHotel } = await supabase
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
      for (let i = 0; i < dates.length; i++) {
        const slotVariantId = slotVariantIds[i] || null;
        const qty = slotQuantities[i] || 1;
        const baseUnitPrice = slotVariantId
          ? Number(varPriceMap.get(slotVariantId) ?? 0)
          : Number(txPriceMap.get(slotTreatmentIds[i]) ?? 0);
        const slotSurcharge = computeOutOfHoursSurcharge(times[i], baseUnitPrice * qty, noHoldHotel || {});

        const { data: newId, error: rpcError } = await supabase.rpc("reserve_trunk_atomically", {
          _booking_date: dates[i],
          _booking_time: times[i],
          _client_email: meta.clientEmail || null,
          _client_first_name: meta.firstName,
          _client_last_name: meta.lastName,
          _client_note: meta.note || null,
          _customer_id: multiCustomerId,
          _duration: slotDurations[i] || 60,
          _hotel_id: meta.hotelId,
          _hotel_name: noHoldHotel?.name || "Hotel",
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
          is_out_of_hours: slotSurcharge.isOutOfHours,
          surcharge_amount: slotSurcharge.surchargeAmount,
        }).eq("id", newId);

        await supabase.from("booking_treatments").insert({
          booking_id: newId,
          treatment_id: slotTreatmentIds[i],
          variant_id: slotVariantId,
        });

        slotCreatedIds.push(newId);
      }

      // booking_payment_infos: UNIQUE constraint on stripe_session_id — attach to first booking only.
      if (multiPaymentMethodId && multiSetupIntent) {
        await supabase.from("booking_payment_infos").insert({
          booking_id: slotCreatedIds[0],
          customer_id: multiCustomerId,
          stripe_payment_method_id: multiPaymentMethodId,
          stripe_setup_intent_id: multiSetupIntent.id,
          stripe_session_id: sessionId,
          card_brand: multiCard?.brand || null,
          card_last4: multiCard?.last4 || null,
          payment_status: "card_saved",
        });
      }

      await triggerBookingNotifications(supabase, slotCreatedIds);

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
        payment_method: "card",
        payment_status: "pending",
        customer_id: multiCustomerId,
      })
      .in("id", multiBookingIds)
      .eq("hotel_id", meta.hotelId)
      .eq("status", "awaiting_payment");

    if (updErr) {
      throw new Error(
        `Erreur lors de la promotion des drafts multi : ${updErr.message}`,
      );
    }

    // booking_payment_infos.stripe_session_id has a UNIQUE constraint, so we
    // attach the row to the first booking only. Sibling bookings of the group
    // are linked via booking_group_id.
    if (multiPaymentMethodId && multiSetupIntent) {
      await supabase.from("booking_payment_infos").insert({
        booking_id: multiBookingIds[0],
        customer_id: multiCustomerId,
        stripe_payment_method_id: multiPaymentMethodId,
        stripe_setup_intent_id: multiSetupIntent.id,
        stripe_session_id: sessionId,
        card_brand: multiCard?.brand || null,
        card_last4: multiCard?.last4 || null,
        payment_status: "card_saved",
      });
    }

    await triggerBookingNotifications(supabase, multiBookingIds);

    return jsonResponse({
      success: true,
      bookingId: multiBookingIds[0],
      bookingIds: multiBookingIds,
    });
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

  await triggerBookingNotifications(supabase, [bookingId]);

  return jsonResponse({ success: true, bookingId });
}
