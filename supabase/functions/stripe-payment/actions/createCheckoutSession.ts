import { isInBlockedSlot } from "../../_shared/blocked-slots.ts";
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

interface TreatmentPayload {
  treatmentId: string;
  variantId?: string;
}

export async function handleCreateCheckoutSession(
  ctx: ActionContext,
): Promise<Response> {
  const { req, body, supabase, stripe } = ctx;

  try {
    console.log("[CREATE-CHECKOUT] Starting checkout session creation");

    const {
      bookingData,
      clientData,
      treatmentIds,
      treatments: treatmentsPayload,
      hotelId,
      language,
      therapistGender,
    } = body as {
      bookingData?: { date: string; time: string };
      clientData?: {
        firstName: string;
        lastName: string;
        phone: string;
        email?: string;
        roomNumber?: string;
        note?: string;
      };
      treatmentIds?: string[];
      treatments?: TreatmentPayload[];
      hotelId?: string;
      language?: string;
      therapistGender?: string | null;
    };

    if (!bookingData || !clientData || !hotelId) {
      throw new Error("Missing required data");
    }

    const effectiveTreatmentIds: string[] =
      treatmentIds ?? (treatmentsPayload ?? []).map((t) => t.treatmentId);
    const variantMap: Record<string, string> = {};
    if (treatmentsPayload) {
      for (const t of treatmentsPayload) {
        if (t.variantId) variantMap[t.treatmentId] = t.variantId;
      }
    }

    if (
      !Array.isArray(effectiveTreatmentIds) ||
      effectiveTreatmentIds.length === 0
    ) {
      throw new Error("At least one treatment is required");
    }

    if (!clientData.firstName || !clientData.lastName || !clientData.phone) {
      throw new Error("Missing required client information");
    }

    const { data: treatments, error: treatmentsError } = await supabase
      .from("treatment_menus")
      .select("id, name, price, hotel_id, status, duration")
      .in("id", effectiveTreatmentIds);

    if (treatmentsError) throw new Error("Failed to fetch treatments");
    if (!treatments || treatments.length === 0) {
      throw new Error("No valid treatments found");
    }

    const invalidTreatments = treatments.filter(
      (t) =>
        (t.hotel_id !== null && t.hotel_id !== hotelId) ||
        t.status !== "active",
    );
    if (invalidTreatments.length > 0) {
      throw new Error("Some treatments are not available for this hotel");
    }

    const verifiedTotalPrice = treatments.reduce(
      (sum, t) => sum + (t.price || 0),
      0,
    );
    if (verifiedTotalPrice <= 0) {
      throw new Error("Invalid total price calculated");
    }

    const totalDuration =
      treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("slug, currency, name, offert, opening_time, closing_time")
      .eq("id", hotelId)
      .maybeSingle();

    if (hotelError) throw hotelError;
    if (!hotel) throw new Error("Hotel not found");

    if (hotel.offert) {
      return jsonResponse(
        {
          error:
            "Ce lieu propose actuellement des soins offerts. Utilisez la réservation directe.",
        },
        400,
      );
    }

    if (hotel.opening_time && hotel.closing_time) {
      const [bh, bm] = bookingData.time.split(":").map(Number);
      const [oh, om] = hotel.opening_time.split(":").map(Number);
      const [ch, cm] = hotel.closing_time.split(":").map(Number);
      const bookingMinutes = bh * 60 + bm;
      const openMinutes = oh * 60 + om;
      const closeMinutes = ch * 60 + cm;
      if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
        return jsonResponse({ error: "BLOCKED_SLOT" }, 400);
      }
    }

    if (
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

    const currency = hotel.currency?.toLowerCase() || "eur";

    const { data: bookingId, error: rpcError } = await supabase.rpc(
      "reserve_trunk_atomically",
      {
        _hotel_id: hotelId,
        _booking_date: bookingData.date,
        _booking_time: bookingData.time,
        _duration: totalDuration,
        _hotel_name: hotel.name,
        _client_first_name: clientData.firstName,
        _client_last_name: clientData.lastName,
        _client_email: clientData.email || null,
        _phone: clientData.phone,
        _room_number: clientData.roomNumber || null,
        _client_note: clientData.note || null,
        _status: "pending",
        _payment_method: "card",
        _payment_status: "awaiting_payment",
        _total_price: verifiedTotalPrice,
        _language: language || "fr",
        _treatment_ids: effectiveTreatmentIds,
        _therapist_gender: therapistGender || null,
      },
    );

    if (rpcError) {
      if (rpcError.message?.includes("NO_TRUNK_AVAILABLE")) {
        return jsonResponse({ error: "SLOT_TAKEN" }, 409);
      }
      throw rpcError;
    }

    for (const treatmentId of effectiveTreatmentIds) {
      await supabase.from("booking_treatments").insert({
        booking_id: bookingId,
        treatment_id: treatmentId,
        variant_id: variantMap[treatmentId] || null,
      });
    }

    const treatmentNames = treatments.map((t) => t.name).join(", ");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmail =
      clientData.email && emailRegex.test(clientData.email)
        ? clientData.email
        : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: validEmail,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "Prestations bien-être",
              description: `${treatmentNames} - ${clientData.firstName} ${clientData.lastName}`,
            },
            unit_amount: Math.round(verifiedTotalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/client/${hotel.slug ?? hotelId}/confirmation/${bookingId}`,
      cancel_url: `${req.headers.get("origin")}/client/${hotel.slug ?? hotelId}/payment`,
      metadata: {
        booking_id: bookingId,
        hotel_id: hotelId,
        site_url: req.headers.get("origin") || "",
      },
    });

    await supabase
      .from("bookings")
      .update({ stripe_invoice_url: session.id })
      .eq("id", bookingId);

    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CHECKOUT] Error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
}
