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
      .select("*, hotel_id, booking_date, booking_time, hotel_name, declined_by, preferred_therapist_gender")
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

    // Get all therapists for this hotel
    const { data: therapists, error: therapistsError } = await supabaseClient
      .from("therapist_venues")
      .select(`
        therapist_id,
        therapists!inner(
          id,
          user_id,
          status,
          first_name,
          last_name,
          gender
        )
      `)
      .eq("hotel_id", booking.hotel_id);

    if (therapistsError) {
      console.error("Error fetching therapists:", therapistsError);
      throw therapistsError;
    }

    if (!therapists || therapists.length === 0) {
      console.log("No therapists found for hotel:", booking.hotel_id);
      return new Response(
        JSON.stringify({ success: true, message: "No therapists to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter active therapists who haven't declined this booking
    let eligibleTherapists = therapists.filter(th => {
      const t = th.therapists as any;
      const statusLower = (t?.status || "").toLowerCase();
      return t &&
             t.user_id &&
             (statusLower === "active" || statusLower === "actif") &&
             !(booking.declined_by || []).includes(t.id);
    });

    // notifyAll = true (concierge flow): notify ALL therapists at this hotel
    // notifyAll = false/undefined (admin flow): notify only assigned therapist
    if (!notifyAll && booking.therapist_id) {
      eligibleTherapists = eligibleTherapists.filter(th => {
        const t = th.therapists as any;
        return t && t.id === booking.therapist_id;
      });
      console.log(`Notifying assigned therapist only`);
    } else {
      // GENDER PREFERENCE FILTER
      // If the client requested a specific gender, only notify matching therapists.
      // Therapists with no gender set (NULL) are always included.
      // Fallback to all genders only if every preferred-gender therapist has already declined.
      const preferredGender: string | null = booking.preferred_therapist_gender ?? null;

      if (preferredGender) {
        const allVenueTherapists = therapists.filter(th => {
          const t = th.therapists as any;
          const statusLower = (t?.status || "").toLowerCase();
          return t && (statusLower === "active" || statusLower === "actif");
        });

        const preferredGenderTherapists = allVenueTherapists.filter(th => {
          const t = th.therapists as any;
          return t.gender === null || (t.gender && t.gender.toLowerCase() === preferredGender.toLowerCase());
        });

        const allPreferredHaveDeclined = preferredGenderTherapists.length > 0 &&
          preferredGenderTherapists.every(th => {
            const t = th.therapists as any;
            return (booking.declined_by || []).includes(t.id);
          });

        if (allPreferredHaveDeclined) {
          // Fallback: notify non-preferred therapists who haven't declined yet
          console.log(`[GENDER] All preferred-gender (${preferredGender}) therapists declined — falling back to others`);
          eligibleTherapists = eligibleTherapists.filter(th => {
            const t = th.therapists as any;
            return t.gender !== null && t.gender.toLowerCase() !== preferredGender.toLowerCase();
          });
        } else {
          // Normal: only notify preferred-gender (+ no gender set) therapists
          console.log(`[GENDER] Filtering to ${preferredGender} therapists (+ unset gender)`);
          eligibleTherapists = eligibleTherapists.filter(th => {
            const t = th.therapists as any;
            return t.gender === null || t.gender.toLowerCase() === preferredGender.toLowerCase();
          });
        }
      }

      console.log(`Notifying ${eligibleTherapists.length} eligible therapists`);
    }

    // Filter out therapists who are blocked/unavailable on the booking date
    if (booking.booking_date && eligibleTherapists.length > 0) {
      const therapistIds = eligibleTherapists
        .map(th => (th.therapists as any)?.id)
        .filter(Boolean);

      const { data: unavailable } = await supabaseClient
        .from("therapist_availability")
        .select("therapist_id")
        .eq("date", booking.booking_date)
        .eq("is_available", false)
        .in("therapist_id", therapistIds);

      if (unavailable && unavailable.length > 0) {
        const unavailableSet = new Set(unavailable.map(u => u.therapist_id));
        console.log(`Filtering out ${unavailableSet.size} unavailable/blocked therapists for date ${booking.booking_date}`);
        eligibleTherapists = eligibleTherapists.filter(th => {
          const t = th.therapists as any;
          return !unavailableSet.has(t?.id);
        });
      }
    }

    // Build notification body with proposed slots if available
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR');
    let notificationBody: string;

    const hasMultipleSlots = proposedSlots && (proposedSlots.slot_2_date || proposedSlots.slot_3_date);

    if (hasMultipleSlots) {
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

    // Send push notifications to each therapist (with DB deduplication)
    let notificationsSent = 0;
    let skippedDuplicates = 0;

    for (const th of eligibleTherapists) {
      const h = th.therapists as any;
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
                title: hasMultipleSlots ? "📋 Nouveau booking - Choisissez un créneau" : "🎉 Nouvelle réservation !",
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

      // Get assigned therapist name if any
      let therapistName = null;
      if (booking.therapist_id && eligibleTherapists.length > 0) {
        const assigned = eligibleTherapists.find(th => (th.therapists as any)?.id === booking.therapist_id);
        if (assigned) {
          const t = assigned.therapists as any;
          therapistName = `${t.first_name} ${t.last_name}`;
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
          therapistName: therapistName || booking.therapist_name,
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
        totalEligible: eligibleTherapists.length,
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
