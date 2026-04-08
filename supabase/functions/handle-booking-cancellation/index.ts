import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CANCELLATION NOTIFICATION HANDLER
 * Triggered when a booking status changes to 'cancelled'
 * Sends notifications to: Therapist (push + in-app) and Slack channel
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
      therapistNotified: false,
      slackNotified: false,
      errors: [] as string[],
    };

    // ============================================
    // 1. NOTIFY THERAPIST (Push + In-App Notification)
    // ============================================
    if (booking.therapist_id) {
      try {
        // Get therapist details
        const { data: therapist } = await supabaseClient
          .from("therapists")
          .select("id, user_id, first_name, last_name")
          .eq("id", booking.therapist_id)
          .single();

        if (therapist?.user_id) {
          // Create in-app notification
          const notificationMessage = `❌ Le rendez-vous de ${timeStr} à ${booking.hotel_name} a été annulé. Ne vous déplacez pas.`;

          const { error: notifError } = await supabaseClient
            .from("notifications")
            .insert({
              user_id: therapist.user_id,
              booking_id: booking.id,
              type: "booking_cancelled",
              message: notificationMessage,
            });

          if (notifError) {
            console.error("[handle-booking-cancellation] Error creating notification:", notifError);
            results.errors.push("Failed to create in-app notification");
          } else {
            console.log("[handle-booking-cancellation] In-app notification created for therapist");
          }

          // Send push notification
          try {
            const { error: pushError } = await supabaseClient.functions.invoke(
              "send-push-notification",
              {
                body: {
                  userId: therapist.user_id,
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
              console.log("[handle-booking-cancellation] Push notification sent to therapist");
            }
          } catch (pushErr) {
            console.error("[handle-booking-cancellation] Push exception:", pushErr);
          }

          results.therapistNotified = true;
        } else {
          console.log("[handle-booking-cancellation] Therapist has no user_id");
        }
      } catch (err) {
        console.error("[handle-booking-cancellation] Therapist notification error:", err);
        results.errors.push("Therapist notification failed");
      }
    } else {
      console.log("[handle-booking-cancellation] No therapist assigned");
    }

    // ============================================
    // 2. NOTIFY ADMINS (Push + In-App Notification)
    // ============================================
    try {
      const { data: adminUsers } = await supabaseClient
        .from("admins")
        .select("user_id, first_name")
        .eq("status", "Actif");

      if (adminUsers && adminUsers.length > 0) {
        for (const admin of adminUsers) {
          if (!admin.user_id) continue;

          const adminMessage = `❌ Réservation #${booking.booking_id} annulée · ${clientName} · ${booking.hotel_name || ""}`;

          // In-app notification
          try {
            await supabaseClient.from("notifications").insert({
              user_id: admin.user_id,
              booking_id: booking.id,
              type: "booking_cancelled",
              message: adminMessage,
            });
          } catch (e) {
            console.error(`[handle-booking-cancellation] Notification error for admin ${admin.first_name}:`, e);
          }

          // Push notification
          try {
            await supabaseClient.functions.invoke("send-push-notification", {
              body: {
                userId: admin.user_id,
                title: "❌ Réservation annulée",
                body: `#${booking.booking_id} · ${clientName} · ${booking.hotel_name || ""}`,
                data: {
                  bookingId: booking.id,
                  type: "booking_cancelled",
                  url: `/admin-pwa/booking/${booking.id}`,
                },
              },
            });
            console.log(`[handle-booking-cancellation] Push sent to admin: ${admin.first_name}`);
          } catch (e) {
            console.error(`[handle-booking-cancellation] Admin push error for ${admin.first_name}:`, e);
          }
        }
      }
    } catch (err) {
      console.error("[handle-booking-cancellation] Admin notification error:", err);
      results.errors.push("Admin notification failed");
    }

    // ============================================
    // 3. NOTIFY SLACK CHANNEL
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
            therapistName: booking.therapist_name,
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
