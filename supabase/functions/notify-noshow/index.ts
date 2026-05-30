import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";

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

    console.log("Processing no-show notification for booking:", bookingId);

    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("id, booking_id, client_first_name, client_last_name, hotel_name, hotel_id, booking_date, booking_time, phone, therapist_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    // Resolve the organization that owns this booking's venue so we only notify
    // admins of that org. Super-admins (Lymfea staff) are authorized cross-org
    // and keep receiving every notification. Without this, org-admins were
    // notified about bookings belonging to other tenants (cross-tenant leak).
    const { data: hotelRow, error: hotelError } = await supabaseClient
      .from("hotels")
      .select("organization_id")
      .eq("id", booking.hotel_id)
      .single();
    if (hotelError) {
      console.error("Error resolving hotel organization:", hotelError);
    }
    const organizationId = hotelRow?.organization_id ?? null;
    if (!organizationId) {
      console.warn(`No organization_id for hotel ${booking.hotel_id}; notifying super-admins only`);
    }

    // Fetch active admins of this booking's org (super-admins see everything).
    let adminsQuery = supabaseClient
      .from("admins")
      .select("email, first_name, last_name, user_id")
      .or("status.eq.active,status.eq.Actif");
    adminsQuery = organizationId
      ? adminsQuery.or(`is_super_admin.eq.true,organization_id.eq.${organizationId}`)
      : adminsQuery.eq("is_super_admin", true);
    const { data: admins, error: adminsError } = await adminsQuery;

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

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
    const message = `⚠️ Client absent · #${booking.booking_id} · ${booking.client_first_name} ${booking.client_last_name} · ${booking.hotel_name || ""} · ${formattedDate} ${booking.booking_time?.substring(0, 5)}`;

    let pushSent = 0;
    for (const admin of admins) {
      if (!admin.user_id) continue;

      // Create in-app notification
      try {
        await supabaseClient.from("notifications").insert({
          user_id: admin.user_id,
          booking_id: booking.id,
          type: "noshow",
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
            title: "⚠️ Client absent",
            body: `#${booking.booking_id} · ${booking.client_first_name} ${booking.client_last_name} · ${booking.hotel_name || ""}`,
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

    console.log(`No-show notifications sent: ${pushSent}/${admins.length}`);

    return new Response(
      JSON.stringify({ success: true, pushSent, totalAdmins: admins.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in notify-noshow:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
