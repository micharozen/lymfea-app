import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { bookingId, cancellationReason } = await req.json();
    
    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Processing cancellation notification for booking:", bookingId);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, therapist_id, booking_date, booking_time, hotel_name, booking_id, client_first_name, client_last_name")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    // Only notify if there's an assigned therapist
    if (!booking.therapist_id) {
      console.log("No therapist assigned to this booking, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No therapist to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get therapist's user_id
    const { data: therapist, error: therapistError } = await supabaseClient
      .from("therapists")
      .select("id, user_id, first_name, last_name")
      .eq("id", booking.therapist_id)
      .single();

    if (therapistError || !therapist) {
      console.error("Therapist not found:", therapistError);
      throw new Error("Therapist not found");
    }

    if (!therapist.user_id) {
      console.log("Therapist has no user_id, skipping push notification");
      return new Response(
        JSON.stringify({ success: true, message: "Therapist has no user account" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build notification message
    const clientName = `${booking.client_first_name} ${booking.client_last_name || ''}`.trim();
    const dateStr = new Date(booking.booking_date).toLocaleDateString('fr-FR');
    
    let notificationBody = `La réservation #${booking.booking_id} de ${clientName} à ${booking.hotel_name} le ${dateStr} a été annulée`;
    if (cancellationReason) {
      notificationBody += `. Raison : ${cancellationReason}`;
    }

    // Send push notification
    try {
      const { error: pushError } = await supabaseClient.functions.invoke(
        "send-push-notification",
        {
          body: {
            userId: therapist.user_id,
            title: "❌ Réservation annulée",
            body: notificationBody,
            data: {
              bookingId: booking.id,
              type: "booking_cancelled",
              url: `/pwa/bookings`,
            },
          },
        }
      );

      if (pushError) {
        console.error(`Error sending push to ${therapist.first_name}:`, pushError);
        return new Response(
          JSON.stringify({ success: false, error: pushError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`✅ Cancellation push sent to ${therapist.first_name} ${therapist.last_name}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Push notification sent to ${therapist.first_name}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error sending push notification:", error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in trigger-booking-cancelled-notification:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
