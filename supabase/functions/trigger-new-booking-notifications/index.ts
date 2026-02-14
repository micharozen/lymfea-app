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

    const { bookingId, notifyAll } = await req.json();

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Processing notifications for booking:", bookingId, "notifyAll:", notifyAll);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, hotel_id, booking_date, booking_time, hotel_name")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // Check if this booking has proposed slots (concierge multi-slot flow)
    let proposedSlots: any = null;
    if (notifyAll) {
      const { data: slots } = await supabaseClient
        .from("booking_proposed_slots")
        .select("*")
        .eq("booking_id", bookingId)
        .single();
      proposedSlots = slots;
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
      const statusLower = (h?.status || "").toLowerCase();
      return h &&
             h.user_id &&
             (statusLower === "active" || statusLower === "actif") &&
             !(booking.declined_by || []).includes(h.id);
    });

    // notifyAll = true (concierge flow): notify ALL hairdressers at this hotel
    // notifyAll = false/undefined (admin flow): notify only assigned hairdresser
    if (!notifyAll && booking.hairdresser_id) {
      eligibleHairdressers = eligibleHairdressers.filter(hh => {
        const h = hh.hairdressers as any;
        return h && h.id === booking.hairdresser_id;
      });
      console.log(`Notifying assigned hairdresser only`);
    } else {
      console.log(`Notifying all ${eligibleHairdressers.length} eligible hairdressers`);
    }

    // Build notification body with proposed slots if available
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR');
    let notificationBody: string;

    if (proposedSlots) {
      notificationBody = `Réservation #${booking.booking_id} à ${booking.hotel_name}\nCréneau 1: ${formatDate(proposedSlots.slot_1_date)} à ${proposedSlots.slot_1_time}`;
      if (proposedSlots.slot_2_date) {
        notificationBody += `\nCréneau 2: ${formatDate(proposedSlots.slot_2_date)} à ${proposedSlots.slot_2_time}`;
      }
      if (proposedSlots.slot_3_date) {
        notificationBody += `\nCréneau 3: ${formatDate(proposedSlots.slot_3_date)} à ${proposedSlots.slot_3_time}`;
      }
    } else {
      notificationBody = `Réservation #${booking.booking_id} à ${booking.hotel_name} le ${formatDate(booking.booking_date)} à ${booking.booking_time}`;
    }

    // Send push notifications to each hairdresser (with DB deduplication)
    let notificationsSent = 0;
    let skippedDuplicates = 0;

    for (const hh of eligibleHairdressers) {
      const h = hh.hairdressers as any;
      if (!h || !h.user_id) continue;

      // Check if notification already sent for this booking+user
      const { data: existingLog } = await supabaseClient
        .from("push_notification_logs")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("user_id", h.user_id)
        .single();

      if (existingLog) {
        console.log(`[DEDUP] Skipping duplicate for user ${h.first_name} - already notified`);
        skippedDuplicates++;
        continue;
      }

      // Insert log BEFORE sending to prevent race conditions
      const { error: logError } = await supabaseClient
        .from("push_notification_logs")
        .insert({
          booking_id: bookingId,
          user_id: h.user_id,
        });

      if (logError) {
        if (logError.code === "23505") {
          console.log(`[DEDUP] Race condition caught for user ${h.first_name}`);
          skippedDuplicates++;
          continue;
        }
        console.error("Error logging notification:", logError);
      }

        try {
          const { error: pushError } = await supabaseClient.functions.invoke(
            "send-push-notification",
            {
              body: {
                userId: h.user_id,
                title: proposedSlots ? "📋 Nouveau booking - Choisissez un créneau" : "🎉 Nouvelle réservation !",
                body: notificationBody,
                data: {
                  bookingId: booking.id,
                  url: `/pwa/booking/${booking.id}`,
                },
              },
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
            }
          );

        if (pushError) {
          console.error(`Error sending push to ${h.first_name}:`, pushError);
        } else {
          console.log(`✅ Push sent to ${h.first_name} ${h.last_name}`);
          notificationsSent++;
        }
      } catch (error) {
        console.error("Error sending notification:", error);
      }
    }

    console.log(`Push notifications sent: ${notificationsSent}, skipped duplicates: ${skippedDuplicates}`);

    // Send Slack notification for new booking
    try {
      // Get treatments for Slack message
      const { data: bookingTreatments } = await supabaseClient
        .from('booking_treatments')
        .select('treatment_id, treatment_menus(name)')
        .eq('booking_id', bookingId);

      const treatments = bookingTreatments?.map(bt => {
        const menu = bt.treatment_menus as any;
        return menu?.name || '';
      }).filter(Boolean) || [];

      // Get assigned hairdresser name if any
      let hairdresserName = null;
      if (booking.hairdresser_id && eligibleHairdressers.length > 0) {
        const assigned = eligibleHairdressers.find(hh => (hh.hairdressers as any)?.id === booking.hairdresser_id);
        if (assigned) {
          const h = assigned.hairdressers as any;
          hairdresserName = `${h.first_name} ${h.last_name}`;
        }
      }

      await supabaseClient.functions.invoke('send-slack-notification', {
        body: {
          type: 'new_booking',
          bookingId: booking.id,
          bookingNumber: booking.booking_id?.toString() || '',
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: booking.hotel_name || '',
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          hairdresserName: hairdresserName || booking.hairdresser_name,
          totalPrice: booking.total_price,
          currency: '€',
          treatments: treatments,
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      console.log('✅ Slack notification sent');
    } catch (slackError) {
      console.error('Error sending Slack notification:', slackError);
      // Don't fail the whole request if Slack fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent,
        skippedDuplicates,
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
