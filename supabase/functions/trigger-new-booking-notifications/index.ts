import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { bookingHasSavedCard } from "../_shared/client-booking-summary.ts";
import { sendSms } from "../_shared/send-sms.ts";


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

    const { bookingId, notifyAll, sendPaymentLink } = await req.json();

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Processing notifications for booking:", bookingId, "notifyAll:", notifyAll);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, hotel_id, booking_date, booking_time, hotel_name, client_type, therapist_gender_preference, hotels(currency, contact_email, address, postal_code, city, country, organizations(name))")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // Shared lookups used across the email + Slack branches below. Fetched
    // once here so each branch reuses them instead of re-querying.
    const venueRow = (booking as any).hotels as {
      currency?: string | null;
      contact_email?: string | null;
      address?: string | null;
      postal_code?: string | null;
      city?: string | null;
      country?: string | null;
      organizations?: { name?: string | null } | null;
    } | null;
    const venueCurrency = (venueRow?.currency || 'eur').toLowerCase();
    const venueContactEmail = venueRow?.contact_email || brand.legal.contactEmail;
    const venueOrganizationName = venueRow?.organizations?.name || brand.name;
    const venueAddress = [venueRow?.address, venueRow?.postal_code, venueRow?.city, venueRow?.country]
      .filter(Boolean)
      .join(', ');

    const { data: bookingTreatmentRows } = await supabaseClient
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price, duration)')
      .eq('booking_id', bookingId);
    const treatments = (bookingTreatmentRows ?? []).map(bt => {
      const menu = bt.treatment_menus as any;
      return {
        name: menu?.name || '',
        price: Number(menu?.price) || 0,
        duration: Number(menu?.duration) || 0,
      };
    });

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

    // Get all therapists for this hotel (with gender for preference filtering)
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
      console.log(`Notifying all ${eligibleTherapists.length} eligible therapists`);
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

    // Gender-based priority filtering (only for broadcast/notifyAll flows)
    const genderPref = (booking as any).therapist_gender_preference as string | null;
    if (notifyAll && genderPref) {
      const priorityGroup = eligibleTherapists.filter(th => (th.therapists as any)?.gender?.toLowerCase() === genderPref?.toLowerCase());
      if (priorityGroup.length > 0) {
        // Phase 1: matching gender therapists still available → notify only them
        console.log(`[GENDER] Preference "${genderPref}": ${priorityGroup.length} priority therapist(s), ${eligibleTherapists.length - priorityGroup.length} fallback`);
        eligibleTherapists = priorityGroup;
      } else {
        // Phase 2: all priority therapists declined (or none exist) → notify fallback group
        console.log(`[GENDER] No priority therapists left for "${genderPref}", falling back to remaining ${eligibleTherapists.length} therapist(s)`);
      }
    }

    // Build notification body with proposed slots if available
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR');
    const formatTime = (timeStr: string) => (timeStr ?? '').slice(0, 5);
    let notificationBody: string;

    const hasMultipleSlots = proposedSlots && (proposedSlots.slot_2_date || proposedSlots.slot_3_date);

    if (hasMultipleSlots) {
      notificationBody = `Réservation #${booking.booking_id} à ${booking.hotel_name}\nCréneau 1: ${formatDate(proposedSlots.slot_1_date)} à ${formatTime(proposedSlots.slot_1_time)}`;
      if (proposedSlots.slot_2_date) {
        notificationBody += `\nCréneau 2: ${formatDate(proposedSlots.slot_2_date)} à ${formatTime(proposedSlots.slot_2_time)}`;
      }
      if (proposedSlots.slot_3_date) {
        notificationBody += `\nCréneau 3: ${formatDate(proposedSlots.slot_3_date)} à ${formatTime(proposedSlots.slot_3_time)}`;
      }
    } else {
      notificationBody = `Réservation #${booking.booking_id} à ${booking.hotel_name} le ${formatDate(booking.booking_date)} à ${formatTime(booking.booking_time)}`;
    }

    // Send push notifications to each therapist (with DB deduplication)
    let notificationsSent = 0;
    let skippedDuplicates = 0;

    const eligibleWithUserId = eligibleTherapists
      .map(th => ({ th, h: th.therapists as any }))
      .filter(({ h }) => h && h.user_id);

    const allUserIds = eligibleWithUserId.map(({ h }) => h.user_id);

    // Batch dedup check: one query for all therapists instead of one per therapist
    let alreadyNotifiedSet = new Set<string>();
    if (allUserIds.length > 0) {
      const { data: existingLogs } = await supabaseClient
        .from("push_notification_logs")
        .select("user_id")
        .eq("booking_id", bookingId)
        .in("user_id", allUserIds);
      alreadyNotifiedSet = new Set((existingLogs || []).map((l: any) => l.user_id));
    }

    const toNotify = eligibleWithUserId.filter(({ h }) => !alreadyNotifiedSet.has(h.user_id));
    skippedDuplicates = eligibleWithUserId.length - toNotify.length;
    if (skippedDuplicates > 0) {
      console.log(`[DEDUP] Skipping ${skippedDuplicates} already-notified therapist(s)`);
    }

    // Bulk insert logs before sending (unique constraint handles any remaining race conditions)
    if (toNotify.length > 0) {
      await supabaseClient
        .from("push_notification_logs")
        .upsert(
          toNotify.map(({ h }) => ({ booking_id: bookingId, user_id: h.user_id })),
          { onConflict: "booking_id,user_id", ignoreDuplicates: true }
        );
    }

    // Send push notifications in parallel
    const pushResults = await Promise.all(
      toNotify.map(async ({ h }) => {
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
            return false;
          }
          console.log(`✅ Push sent to ${h.first_name} ${h.last_name}`);
          return true;
        } catch (error) {
          console.error("Error sending notification:", error);
          return false;
        }
      })
    );
    notificationsSent = pushResults.filter(Boolean).length;

    console.log(`Push notifications sent: ${notificationsSent}, skipped duplicates: ${skippedDuplicates}`);

    // Send confirmation email to the client (Resend template)
    try {
      // Prefer customer record (created upstream by find_or_create_customer) over booking columns
      let customer: { email?: string | null; phone?: string | null; first_name?: string | null; last_name?: string | null; language?: string | null } | null = null;
      if ((booking as any).customer_id) {
        const { data: customerRow } = await supabaseClient
          .from('customers')
          .select('email, phone, first_name, last_name, language')
          .eq('id', (booking as any).customer_id)
          .maybeSingle();
        customer = customerRow ?? null;
      }

      // Resolve the client communication language. The booking-level value is
      // the operator's explicit per-booking choice (set at creation from the
      // phone country code, but editable) and takes precedence over the
      // customer's stored default.
      const bookingLanguage = (booking as any).language;
      const resolvedLanguage: 'fr' | 'en' =
        bookingLanguage === 'en' || bookingLanguage === 'fr'
          ? bookingLanguage
          : ((customer as any)?.language === 'en' ? 'en' : 'fr');
      console.log('[trigger-new-booking-notifications] language resolution', {
        bookingId,
        booking_language: bookingLanguage ?? null,
        customer_id: (booking as any).customer_id ?? null,
        customer_language: (customer as any)?.language ?? null,
        resolved: resolvedLanguage,
      });

      // Prefer the email captured on the booking itself (it reflects the
      // latest value typed by the operator in the FAB, which may override a
      // stale address on the customer record).
      const clientEmail = (booking as any).client_email
        || customer?.email
        || undefined;

      if (clientEmail) {
        const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
        const formattedTime = booking.booking_time?.substring(0, 5) || '';

        const siteUrl = Deno.env.get('SITE_URL') || `https://${brand.appDomain}`;
        const clientBookingUrl = `${siteUrl}/booking/manage/${bookingId}`;

        const treatmentName = treatments.map(t => t.name).filter(Boolean).join(', ');
        const treatmentPrice = treatments.reduce((sum, t) => sum + t.price, 0);
        const treatmentDuration = treatments.reduce((sum, t) => sum + t.duration, 0);

        const firstName = customer?.first_name ?? booking.client_first_name ?? '';
        const lastName = customer?.last_name ?? booking.client_last_name ?? '';
        const clientName = `${firstName} ${lastName}`.trim();
        const clientPhone = customer?.phone ?? (booking as any).phone ?? (booking as any).client_phone ?? '';

        const isExternal = (booking as any).client_type === 'external';
        const isPending = booking.status === 'pending';

        const hasSavedCard = await bookingHasSavedCard(supabaseClient, bookingId);

        if (isExternal && !hasSavedCard) {
          // Admin external without card: no client email at creation — operator sends
          // payment link manually (FAB). sendPaymentLink in the body is ignored here.
          console.log('[trigger-new-booking-notifications] External without saved card → no client email at creation:', bookingId, { sendPaymentLink });
        } else {
          const clientLanguage: 'fr' | 'en' = resolvedLanguage;
          console.log('[trigger-new-booking-notifications] standard branch', { bookingId, clientLanguage, isPending });

          // Payment gate: a confirmed booking whose payment is not yet engaged
          // must NOT receive the confirmation email. The operator sends a payment
          // link manually; the confirmed email (CLIENT_NEW_BOOKING) is then sent
          // by the Stripe webhook once paid. Pending bookings still get the
          // pending template regardless of payment.
          const PAID_STATUSES = ['paid', 'charged', 'charged_to_room', 'card_saved', 'pending_partner_billing'];
          const isPaidEnough = PAID_STATUSES.includes((booking as any).payment_status);

          if (!isPending && !isPaidEnough) {
            console.log('[trigger-new-booking-notifications] Confirmed booking not paid yet → skipping client email:', bookingId);
          } else {
            const { error: confirmFnError } = await supabaseClient.functions.invoke(
              'send-booking-confirmation',
              {
                body: {
                  email: clientEmail,
                  bookingId,
                  bookingNumber: String(booking.booking_id ?? ''),
                  clientName,
                  hotelName: booking.hotel_name ?? '',
                  roomNumber: booking.room_number ? String(booking.room_number) : '',
                  bookingDate: booking.booking_date,
                  bookingTime: formattedTime,
                  treatments: treatments.map((t) => ({
                    name: t.name,
                    price: t.price,
                    isPriceOnRequest: false,
                  })),
                  totalPrice: Number(booking.total_price) || treatments.reduce((sum, t) => sum + t.price, 0),
                  currency: venueCurrency.toUpperCase(),
                  siteUrl,
                  isQuotePending: false,
                  isPendingBooking: isPending,
                  language: clientLanguage,
                },
              },
            );

            if (confirmFnError) {
              console.error('[trigger-new-booking-notifications] Client email error:', confirmFnError);
            } else {
              console.log('[trigger-new-booking-notifications] Client email sent via send-booking-confirmation');

              // SMS de confirmation : uniquement quand le booking est confirmed
              // au moment de la création (cas admin direct-assign). Les bookings
              // pending qui passent à confirmed plus tard via acceptation
              // thérapeute déclenchent notify-booking-confirmed qui envoie le SMS.
              // isPaidEnough est déjà garanti ici (sinon on n'envoie rien).
              if (!isPending && booking.status === 'confirmed') {
                if (clientPhone) {
                  try {
                    const language: 'fr' | 'en' = resolvedLanguage;
                    // SMS court (1 segment GSM-7 = 160 chars). Pas d'accents,
                    // pas de lien manage (l'email contient deja l'URL).
                    const shortToken = (booking as any).short_token;
                    const smsManageUrl = shortToken
                      ? `${siteUrl}/m/${shortToken}`
                      : clientBookingUrl;
                    const smsBody = language === 'fr'
                      ? `Bonjour ${firstName}, votre soin chez ${booking.hotel_name ?? ''} le ${formattedDate} à ${formattedTime} est confirmé. Gérer : ${smsManageUrl}`
                      : `Hello ${firstName}, your treatment at ${booking.hotel_name ?? ''} on ${formattedDate} at ${formattedTime} is confirmed. Manage: ${smsManageUrl}`;
                    const smsResult = await sendSms({ to: clientPhone, body: smsBody });
                    if (smsResult.error) {
                      console.error('[trigger-new-booking-notifications][sms] Confirmation SMS error:', smsResult.error);
                    } else {
                      console.log('[trigger-new-booking-notifications][sms] Confirmation SMS sent:', smsResult.sid);
                    }
                  } catch (smsErr) {
                    console.error('[trigger-new-booking-notifications][sms] Confirmation SMS exception:', smsErr);
                  }
                } else {
                  console.log('[trigger-new-booking-notifications][sms] No phone on customer/booking, skipping confirmation SMS');
                }
              }
            }
          }
        }
      } else {
        console.log('[trigger-new-booking-notifications] No email on customer or booking, skipping client email');
      }
    } catch (emailError) {
      console.error('[trigger-new-booking-notifications] Error sending client email:', emailError);
    }

    // Send Slack notification for new booking
    try {
      // Reuse the treatments fetched once at the top of the function.
      const treatmentNames = treatments.map(t => t.name).filter(Boolean);

      // Get assigned therapist name if any
      let therapistName = null;
      if (booking.therapist_id && eligibleTherapists.length > 0) {
        const assigned = eligibleTherapists.find(th => (th.therapists as any)?.id === booking.therapist_id);
        if (assigned) {
          const t = assigned.therapists as any;
          therapistName = `${t.first_name} ${t.last_name}`;
        }
      }

      const slackType = booking.status === 'confirmed' ? 'booking_confirmed' : 'new_booking';

      await supabaseClient.functions.invoke('send-slack-notification', {
        body: {
          type: slackType,
          bookingId: booking.id,
          bookingNumber: booking.booking_id?.toString() || '',
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: booking.hotel_name || '',
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          therapistName: therapistName || booking.therapist_name,
          totalPrice: booking.total_price,
          currency: '€',
          treatments: treatmentNames,
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
