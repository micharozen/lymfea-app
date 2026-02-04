import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CANCELLATION NOTIFICATION HANDLER
 * Triggered when a booking status changes to 'cancelled'
 * Sends notifications to: Hairdresser (push + in-app) and Slack channel
 */
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

    console.log("[handle-booking-cancellation] Processing booking:", bookingId);

    // Get full booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[handle-booking-cancellation] Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    const clientName = `${booking.client_first_name} ${booking.client_last_name || ""}`.trim();
    const timeStr = booking.booking_time?.substring(0, 5) || "";
    const reason = cancellationReason || booking.cancellation_reason || "Non spécifiée";

    const results = {
      hairdresserNotified: false,
      slackNotified: false,
      errors: [] as string[],
    };

    // ============================================
    // 1. NOTIFY HAIRDRESSER (Push + In-App Notification)
    // ============================================
    if (booking.hairdresser_id) {
      try {
        // Get hairdresser details
        const { data: hairdresser } = await supabaseClient
          .from("hairdressers")
          .select("id, user_id, first_name, last_name")
          .eq("id", booking.hairdresser_id)
          .single();

        if (hairdresser?.user_id) {
          // Create in-app notification
          const notificationMessage = `❌ Le rendez-vous de ${timeStr} à ${booking.hotel_name} a été annulé. Ne vous déplacez pas.`;

          const { error: notifError } = await supabaseClient
            .from("notifications")
            .insert({
              user_id: hairdresser.user_id,
              booking_id: booking.id,
              type: "booking_cancelled",
              message: notificationMessage,
            });

          if (notifError) {
            console.error("[handle-booking-cancellation] Error creating notification:", notifError);
            results.errors.push("Failed to create in-app notification");
          } else {
            console.log("[handle-booking-cancellation] In-app notification created for hairdresser");
          }

          // Send push notification
          try {
            const { error: pushError } = await supabaseClient.functions.invoke(
              "send-push-notification",
              {
                body: {
                  userId: hairdresser.user_id,
                  title: "❌ Réservation Annulée",
                  body: `Le RDV de ${timeStr} à ${booking.hotel_name} a été annulé. Ne vous déplacez pas.`,
                  data: {
                    bookingId: booking.id,
                    type: "booking_cancelled",
                    url: "/pwa/bookings",
                  },
                },
              }
            );

            if (pushError) {
              console.error("[handle-booking-cancellation] Push error:", pushError);
              results.errors.push("Failed to send push notification");
            } else {
              console.log("[handle-booking-cancellation] Push notification sent to hairdresser");
            }
          } catch (pushErr) {
            console.error("[handle-booking-cancellation] Push exception:", pushErr);
          }

          results.hairdresserNotified = true;
        } else {
          console.log("[handle-booking-cancellation] Hairdresser has no user_id");
        }
      } catch (err) {
        console.error("[handle-booking-cancellation] Hairdresser notification error:", err);
        results.errors.push("Hairdresser notification failed");
      }
    } else {
      console.log("[handle-booking-cancellation] No hairdresser assigned");
    }

    // ============================================
    // 2. NOTIFY SLACK CHANNEL
    // ============================================
    try {
      const { error: slackError } = await supabaseClient.functions.invoke(
        "send-slack-notification",
        {
          body: {
            type: "booking_cancelled",
            bookingId: booking.id,
            bookingNumber: booking.booking_id?.toString() || "",
            clientName: clientName,
            hotelName: booking.hotel_name || "",
            bookingDate: booking.booking_date,
            bookingTime: booking.booking_time,
            hairdresserName: booking.hairdresser_name,
            totalPrice: booking.total_price,
            currency: "€",
            cancellationReason: reason,
          },
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        }
      );

      if (slackError) {
        console.error("[handle-booking-cancellation] Slack error:", slackError);
        results.errors.push("Failed to send Slack notification");
      } else {
        console.log("[handle-booking-cancellation] Slack notification sent");
        results.slackNotified = true;
      }
    } catch (slackErr) {
      console.error("[handle-booking-cancellation] Slack exception:", slackErr);
      results.errors.push("Slack notification failed");
    }

    console.log("[handle-booking-cancellation] Results:", results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[handle-booking-cancellation] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
