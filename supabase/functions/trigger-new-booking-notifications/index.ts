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

    const { bookingId } = await req.json();
    
    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Processing notifications for booking:", bookingId);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, hotel_id, booking_date, booking_time, hotel_name")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // Get all hairdressers for this hotel
    const { data: hairdressers, error: hairdressersError } = await supabaseClient
      .from("hairdresser_hotels")
      .select(`
        hairdresser_id,
        hairdressers!inner(
          id,
          user_id,
          status,
          first_name,
          last_name
        )
      `)
      .eq("hotel_id", booking.hotel_id);

    if (hairdressersError) {
      console.error("Error fetching hairdressers:", hairdressersError);
      throw hairdressersError;
    }

    if (!hairdressers || hairdressers.length === 0) {
      console.log("No hairdressers found for hotel:", booking.hotel_id);
      return new Response(
        JSON.stringify({ success: true, message: "No hairdressers to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter active hairdressers who haven't declined this booking
    let eligibleHairdressers = hairdressers.filter(hh => {
      const h = hh.hairdressers as any;
      return h && 
             h.user_id && 
             h.status === "Actif" &&
             !(booking.declined_by || []).includes(h.id);
    });

    // Si un hairdresser est assigné, ne notifier que lui
    if (booking.hairdresser_id) {
      eligibleHairdressers = eligibleHairdressers.filter(hh => {
        const h = hh.hairdressers as any;
        return h && h.id === booking.hairdresser_id;
      });
      console.log(`Notifying assigned hairdresser only`);
    } else {
      console.log(`Notifying all ${eligibleHairdressers.length} eligible hairdressers`);
    }

    // Send push notifications to each hairdresser
    const notifications = await Promise.allSettled(
      eligibleHairdressers.map(async (hh) => {
        const h = hh.hairdressers as any;
        if (!h || !h.user_id) return { success: false };

        try {
          // Send push notification
          const { error: pushError } = await supabaseClient.functions.invoke(
            "send-push-notification",
            {
              body: {
                userId: h.user_id,
                title: "🎉 Nouvelle réservation !",
                body: `Réservation #${booking.booking_id} à ${booking.hotel_name} le ${new Date(booking.booking_date).toLocaleDateString('fr-FR')} à ${booking.booking_time}`,
                data: {
                  bookingId: booking.id,
                  url: `/pwa/bookings/${booking.id}`,
                },
              },
            }
          );

          if (pushError) {
            console.error(`Error sending push to ${h.first_name}:`, pushError);
          }

          return { success: true, hairdresserId: h.id };
        } catch (error) {
          console.error("Error sending notification:", error);
          return { success: false, hairdresserId: h.id };
        }
      })
    );

    const successful = notifications.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    console.log(`Notifications sent: ${successful}/${eligibleHairdressers.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: successful,
        totalEligible: eligibleHairdressers.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in trigger-new-booking-notifications:", error);
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
