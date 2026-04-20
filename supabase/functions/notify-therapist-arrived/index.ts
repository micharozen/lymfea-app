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

    const { bookingId, therapistName } = await req.json();

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Processing therapist arrival for booking:", bookingId);

    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("id, booking_id, hotel_name, hotel_id, booking_date, booking_time")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    // Fetch all active admins
    const { data: admins, error: adminsError } = await supabaseClient
      .from("admins")
      .select("email, first_name, last_name, user_id")
      .eq("status", "Actif");

    if (adminsError) {
      console.error("Error fetching admins:", adminsError);
      throw adminsError;
    }

    if (!admins || admins.length === 0) {
      console.log("No active admins found");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = `📍 ${therapistName || 'Thérapeute'} est arrivé(e) · #${booking.booking_id} · ${booking.hotel_name || ""} · ${booking.booking_time?.substring(0, 5)}`;

    let pushSent = 0;
    for (const admin of admins) {
      if (!admin.user_id) continue;

      // Create in-app notification
      try {
        await supabaseClient.from("notifications").insert({
          user_id: admin.user_id,
          booking_id: booking.id,
          type: "therapist_arrived",
          message,
        });
      } catch (e) {
        console.error(`Error creating notification for admin ${admin.first_name}:`, e);
      }

      // Send push notification
      try {
        const { error: pushError } = await supabaseClient.functions.invoke("send-push-notification", {
          body: {
            userId: admin.user_id,
            title: "📍 Thérapeute arrivé(e)",
            body: `${therapistName || 'Thérapeute'} · #${booking.booking_id} · ${booking.hotel_name || ""}`,
            data: {
              bookingId: booking.id,
              url: `/admin/booking?bookingId=${booking.id}`,
            },
          },
        });

        if (!pushError) {
          pushSent++;
          console.log(`✅ Push sent to admin: ${admin.first_name}`);
        } else {
          console.error(`Push error for admin ${admin.first_name}:`, pushError);
        }
      } catch (e) {
        console.error(`Push exception for admin ${admin.first_name}:`, e);
      }
    }

    console.log(`Therapist arrival notifications sent: ${pushSent}/${admins.length}`);

    return new Response(
      JSON.stringify({ success: true, pushSent, totalAdmins: admins.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in notify-therapist-arrived:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
