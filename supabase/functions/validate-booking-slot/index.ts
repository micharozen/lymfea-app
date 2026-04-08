import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateSlotRequest {
  bookingId: string;
  slotNumber: 1 | 2 | 3;
  therapistId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { bookingId, slotNumber, therapistId }: ValidateSlotRequest = await req.json();

    if (!bookingId || !slotNumber || !therapistId) {
      throw new Error("Missing required fields: bookingId, slotNumber, therapistId");
    }

    console.log(`[VALIDATE-SLOT] Booking ${bookingId}, slot ${slotNumber}, therapist ${therapistId}`);

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    if (booking.status !== "awaiting_hairdresser_selection") {
      throw new Error(`Booking is not awaiting therapist selection (current status: ${booking.status})`);
    }

    // Fetch proposed slots
    const { data: slots, error: slotsError } = await supabase
      .from("booking_proposed_slots")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (slotsError || !slots) {
      throw new Error("No proposed slots found for this booking");
    }

    // Check if already validated (first-come-first-served)
    if (slots.validated_slot !== null) {
      throw new Error("This booking has already been validated by another therapist");
    }

    // Get the selected slot date/time
    let selectedDate: string;
    let selectedTime: string;

    switch (slotNumber) {
      case 1:
        selectedDate = slots.slot_1_date;
        selectedTime = slots.slot_1_time;
        break;
      case 2:
        if (!slots.slot_2_date || !slots.slot_2_time) throw new Error("Slot 2 is not available");
        selectedDate = slots.slot_2_date;
        selectedTime = slots.slot_2_time;
        break;
      case 3:
        if (!slots.slot_3_date || !slots.slot_3_time) throw new Error("Slot 3 is not available");
        selectedDate = slots.slot_3_date;
        selectedTime = slots.slot_3_time;
        break;
      default:
        throw new Error("Invalid slot number");
    }

    // Fetch therapist details
    const { data: therapist, error: thError } = await supabase
      .from("therapists")
      .select("id, first_name, last_name")
      .eq("id", therapistId)
      .single();

    if (thError || !therapist) {
      throw new Error("Therapist not found");
    }

    const therapistName = `${therapist.first_name} ${therapist.last_name}`;

    // Update proposed slots with validation info (atomic check via validated_slot IS NULL)
    const { data: updatedSlots, error: updateSlotsError } = await supabase
      .from("booking_proposed_slots")
      .update({
        validated_slot: slotNumber,
        validated_by: therapistId,
        validated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .is("validated_slot", null) // First-come-first-served guard
      .select()
      .single();

    if (updateSlotsError || !updatedSlots) {
      throw new Error("This booking has already been validated by another therapist");
    }

    // Update booking with validated slot and therapist
    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({
        booking_date: selectedDate,
        booking_time: selectedTime,
        therapist_id: therapistId,
        therapist_name: therapistName,
        status: "confirmed",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (updateBookingError) {
      throw new Error(`Failed to update booking: ${updateBookingError.message}`);
    }

    console.log(`[VALIDATE-SLOT] Booking ${bookingId} confirmed with slot ${slotNumber} (${selectedDate} ${selectedTime}) by ${therapistName}`);

    // Send payment link to client
    try {
      await supabase.functions.invoke("send-payment-link", {
        body: {
          bookingId: booking.id,
          language: "en",
          channels: ["whatsapp"],
          clientPhone: booking.phone,
          clientEmail: booking.client_email,
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log("[VALIDATE-SLOT] Payment link sent to client");
    } catch (paymentError) {
      console.error("[VALIDATE-SLOT] Error sending payment link:", paymentError);
      // Don't fail the validation if payment link fails - it can be resent manually
    }

    // Fetch hotel currency for Slack notification
    let currency = "EUR";
    try {
      const { data: hotel } = await supabase
        .from("hotels")
        .select("currency")
        .eq("id", booking.hotel_id)
        .single();
      if (hotel?.currency) {
        currency = hotel.currency.toUpperCase();
      }
    } catch (e) {
      console.error("[VALIDATE-SLOT] Error fetching hotel currency, defaulting to EUR:", e);
    }

    // Send Slack notification
    try {
      await supabase.functions.invoke("send-slack-notification", {
        body: {
          type: "booking_confirmed",
          bookingId: booking.id,
          bookingNumber: booking.booking_id?.toString() || "",
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: booking.hotel_name || "",
          bookingDate: selectedDate,
          bookingTime: selectedTime,
          therapistName,
          totalPrice: booking.total_price,
          currency,
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log("[VALIDATE-SLOT] Slack notification sent");
    } catch (slackError) {
      console.error("[VALIDATE-SLOT] Error sending Slack notification:", slackError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        selectedDate,
        selectedTime,
        therapistName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[VALIDATE-SLOT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
