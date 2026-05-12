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

export async function handleHandleCheckoutSuccess(
  ctx: ActionContext,
): Promise<Response> {
  const { body, supabase, stripe: defaultStripe } = ctx;

  try {
    const { sessionId, hotelId: bodyHotelId } = body as {
      sessionId?: string;
      hotelId?: string;
    };
    if (!sessionId) throw new Error("Missing session ID");

    let stripe = defaultStripe;
    if (bodyHotelId) {
      const resolved = await getStripeForVenue(supabase, bodyHotelId);
      stripe = resolved.client;
    }

    let session = await stripe.checkout.sessions.retrieve(sessionId);

    // If the session was created on a venue Stripe account but caller didn't pass hotelId,
    // re-resolve via metadata.hotel_id and retry once.
    const metadata = session.metadata || {};
    const metadataHotelId = metadata.hotel_id as string | undefined;
    if (!bodyHotelId && metadataHotelId) {
      const resolved = await getStripeForVenue(supabase, metadataHotelId);
      if (resolved.source === "venue") {
        stripe = resolved.client;
        session = await stripe.checkout.sessions.retrieve(sessionId);
      }
    }

    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    const meta = session.metadata || {};
    const treatments = JSON.parse((meta.treatments as string) || "[]");

    const { data: hotel } = await supabase
      .from("hotels")
      .select("name")
      .eq("id", meta.hotel_id)
      .maybeSingle();

    const { data: rooms } = await supabase
      .from("treatment_rooms")
      .select("id")
      .eq("hotel_id", meta.hotel_id)
      .eq("status", "active");

    let roomId: string | null = null;
    if (rooms && rooms.length > 0) {
      const { data: bookingsWithRooms } = await supabase
        .from("bookings")
        .select("room_id")
        .eq("hotel_id", meta.hotel_id)
        .eq("booking_date", meta.booking_date)
        .eq("booking_time", meta.booking_time)
        .not("room_id", "is", null)
        .not("status", "in", '("Annulé","Terminé","cancelled")');
      const usedRoomIds = new Set(
        bookingsWithRooms?.map((b: { room_id: string }) => b.room_id) || [],
      );
      for (const room of rooms) {
        if (!usedRoomIds.has(room.id)) {
          roomId = room.id;
          break;
        }
      }
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        hotel_id: meta.hotel_id,
        hotel_name: hotel?.name,
        client_first_name: meta.client_first_name,
        client_last_name: meta.client_last_name,
        client_email: meta.client_email,
        phone: meta.client_phone,
        room_number: meta.room_number || null,
        client_note: meta.client_note || null,
        booking_date: meta.booking_date,
        booking_time: meta.booking_time,
        status: "pending",
        payment_method: "card",
        payment_status: "paid",
        total_price: parseFloat((meta.total_price as string) || "0"),
        room_id: roomId,
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    if (treatments.length > 0) {
      await supabase.from("booking_treatments").insert(
        treatments.map((t: { id: string }) => ({ booking_id: booking.id, treatment_id: t.id })),
      );
    }

    const { data: treatmentDetails } = await supabase
      .from("treatment_menus")
      .select("name, price")
      .in(
        "id",
        treatments.map((t: { id: string }) => t.id),
      );

    const treatmentNames =
      treatmentDetails?.map(
        (t: { name: string; price: number }) => `${t.name} - ${t.price}€`,
      ) || [];

    const serviceRoleAuth = {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    };

    try {
      await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          email: meta.client_email,
          bookingNumber: booking.booking_id?.toString(),
          clientName: `${meta.client_first_name} ${meta.client_last_name}`,
          hotelName: hotel?.name,
          roomNumber: meta.room_number,
          bookingDate: meta.booking_date,
          bookingTime: meta.booking_time,
          treatments: treatmentNames,
          totalPrice: parseFloat((meta.total_price as string) || "0"),
          currency: "EUR",
        },
        headers: serviceRoleAuth,
      });
    } catch (e) {
      console.error("[CHECKOUT-SUCCESS] Email error:", e);
    }

    try {
      await supabase.functions.invoke("notify-admin-new-booking", {
        body: { bookingId: booking.id },
        headers: serviceRoleAuth,
      });
    } catch (e) {
      console.error("[CHECKOUT-SUCCESS] Admin notification error:", e);
    }

    try {
      await supabase.functions.invoke("trigger-new-booking-notifications", {
        body: { bookingId: booking.id },
        headers: serviceRoleAuth,
      });
    } catch (e) {
      console.error("[CHECKOUT-SUCCESS] Push notification error:", e);
    }

    return jsonResponse({ success: true, bookingId: booking.booking_id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CHECKOUT-SUCCESS] Error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
}
