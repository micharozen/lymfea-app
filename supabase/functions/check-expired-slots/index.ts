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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log("[CHECK-EXPIRED-SLOTS] Checking for expired proposed slots...");

    // Find expired slots that haven't been validated and admin hasn't been notified
    const { data: expiredSlots, error } = await supabase
      .from("booking_proposed_slots")
      .select("*, bookings!inner(id, booking_id, client_first_name, client_last_name, hotel_name, status)")
      .is("validated_slot", null)
      .is("admin_notified_at", null)
      .lt("expires_at", new Date().toISOString());

    if (error) {
      throw new Error(`Error fetching expired slots: ${error.message}`);
    }

    if (!expiredSlots || expiredSlots.length === 0) {
      console.log("[CHECK-EXPIRED-SLOTS] No expired slots found");
      return new Response(
        JSON.stringify({ success: true, expired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-EXPIRED-SLOTS] Found ${expiredSlots.length} expired slot(s)`);

    let notified = 0;

    for (const slot of expiredSlots) {
      const booking = (slot as any).bookings;
      if (!booking || booking.status !== "awaiting_hairdresser_selection") continue;

      // Mark admin as notified to prevent duplicate notifications
      await supabase
        .from("booking_proposed_slots")
        .update({ admin_notified_at: new Date().toISOString() })
        .eq("id", slot.id);

      // Send Slack notification to admin
      try {
        await supabase.functions.invoke("send-slack-notification", {
          body: {
            type: "new_booking",
            bookingId: booking.id,
            bookingNumber: booking.booking_id?.toString() || "",
            clientName: `${booking.client_first_name} ${booking.client_last_name}`,
            hotelName: booking.hotel_name || "",
            bookingDate: slot.slot_1_date,
            bookingTime: slot.slot_1_time,
            hairdresserName: "Aucun coiffeur (expiration 2h)",
            totalPrice: 0,
            currency: "EUR",
          },
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        });
        notified++;
        console.log(`[CHECK-EXPIRED-SLOTS] Admin notified for booking ${booking.booking_id}`);
      } catch (slackError) {
        console.error(`[CHECK-EXPIRED-SLOTS] Error notifying admin for booking ${booking.booking_id}:`, slackError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, expired: expiredSlots.length, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CHECK-EXPIRED-SLOTS] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
