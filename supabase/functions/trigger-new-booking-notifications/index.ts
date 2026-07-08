import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand, transactionalFrom } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { getStripeForVenue } from "../_shared/stripe-resolver.ts";
import {
  clientGreeting,
  buildConfirmedVars,
  buildPendingVars,
  buildPaymentLinkVars,
} from "../_shared/booking-email-vars.ts";
import { getBookingConfirmedHtml } from "../_shared/templates/booking-confirmed.ts";
import { getBookingPendingHtml } from "../_shared/templates/booking-pending.ts";
import { buildBookingIcs } from "../_shared/ics.ts";
import type { EmailAttachment } from "../_shared/send-email.ts";

/** UTF-8-safe base64 (btoa alone breaks on accented chars in the .ics). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Resend template still used only for the EXTERNAL client payment-link flow.
const EXTERNAL_CLIENT_PAYMENT_TEMPLATE_FR = "3edb6ede-b627-4727-9eaa-f8fdf845975b";
const EXTERNAL_CLIENT_PAYMENT_TEMPLATE_EN = "6ba59c67-04e3-412e-9a84-246aaa7dc570";

function calculateExpirationDate(bookingDate: Date, now: Date): Date {
  const diffInHours = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffInHours > 48) return new Date(bookingDate.getTime() - 24 * 60 * 60 * 1000);
  if (diffInHours > 24) return new Date(bookingDate.getTime() - 6 * 60 * 60 * 1000);
  if (diffInHours > 6) return new Date(bookingDate.getTime() - 3 * 60 * 60 * 1000);
  if (diffInHours > 2) {
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneHourBeforeAppt = new Date(bookingDate.getTime() - 1 * 60 * 60 * 1000);
    return twoHoursLater < oneHourBeforeAppt ? twoHoursLater : oneHourBeforeAppt;
  }
  return new Date(now.getTime() + 1 * 60 * 60 * 1000);
}

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
      .select(`
        id,
        booking_id,
        booking_group_id,
        hotel_id,
        booking_date,
        booking_time,
        hotel_name,
        client_type,
        therapist_gender_preference,
        declined_by,
        therapist_id,
        customer_id,
        language,
        client_email,
        phone,
        client_first_name,
        client_last_name,
        room_number,
        therapist_name,
        total_price,
        surcharge_amount,
        is_out_of_hours,
        status,
        payment_status,
        short_token,
        hotels(name, currency, image, contact_email, address, postal_code, city, country, timezone, website_url, cancellation_policy_text_en, cancellation_policy_text_fr, organizations(name))
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      // Surface the real cause instead of masking every failure as "not found".
      // A PostgREST error (bad column, embed, auth) sets bookingError; a genuinely
      // missing/uncommitted row leaves bookingError null with booking === null.
      console.error("[trigger-new-booking-notifications] Booking fetch failed", {
        bookingId,
        supabaseUrl: Deno.env.get("SUPABASE_URL"),
        hasBooking: !!booking,
        errorCode: bookingError?.code ?? null,
        errorMessage: bookingError?.message ?? null,
        errorDetails: bookingError?.details ?? null,
        errorHint: bookingError?.hint ?? null,
      });
      throw new Error(
        bookingError
          ? `Booking fetch error (${bookingError.code}): ${bookingError.message}`
          : `Booking not found for id ${bookingId}`
      );
    }

    // Shared lookups used across the email + Slack branches below. Fetched
    // once here so each branch reuses them instead of re-querying.
    const venueRow = (booking as any).hotels as {
      name?: string | null;
      currency?: string | null;
      image?: string | null;
      contact_email?: string | null;
      address?: string | null;
      postal_code?: string | null;
      city?: string | null;
      country?: string | null;
      timezone?: string | null;
      website_url?: string | null;
      organizations?: { name?: string | null } | null;
    } | null;
    const venueCurrency = (venueRow?.currency || 'eur').toLowerCase();
    const venueContactEmail = venueRow?.contact_email || brand.legal.contactEmail;
    const venueOrganizationName = venueRow?.organizations?.name || brand.name;

    const { data: bookingTreatmentRows } = await supabaseClient
      .from('booking_treatments')
      .select('treatment_id, price_override, treatment_menus(name, price, duration), treatment_variants(label, price, duration)')
      .eq('booking_id', bookingId);
    const treatments = (bookingTreatmentRows ?? []).map(bt => {
      const menu = bt.treatment_menus as any;
      const variant = bt.treatment_variants as any;
      return {
        name: (menu?.name || '') + (variant?.label ? ` · ${variant.label}` : ''),
        price: resolveTreatmentPrice(bt as any),
        duration: Number(variant?.duration ?? menu?.duration) || 0,
      };
    });

    // Check if this booking has proposed slots (concierge multi-slot flow)
    let proposedSlots: any = null;
    if (notifyAll) {
      const { data: slots } = await supabaseClient
        .from("booking_proposed_slots")
        .select("slot_1_date, slot_1_time, slot_2_date, slot_2_time, slot_3_date, slot_3_time")
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

    // Assigned therapists (duo = plusieurs lignes). Source de vérité pour le ciblage
    // non-broadcast : on notifie TOUS les praticiens assignés, pas seulement le principal.
    let assignedTherapistIds: string[] = [];
    if (!notifyAll) {
      const { data: assignedRows } = await supabaseClient
        .from("booking_therapists")
        .select("therapist_id")
        .eq("booking_id", bookingId);
      assignedTherapistIds = (assignedRows ?? []).map((r: { therapist_id: string }) => r.therapist_id);
      // Fallback legacy : pas de lignes junction → retomber sur le principal.
      if (assignedTherapistIds.length === 0 && booking.therapist_id) {
        assignedTherapistIds = [booking.therapist_id];
      }
    }

    // notifyAll = true (concierge/broadcast flow): notify ALL therapists at this hotel
    // notifyAll = false/undefined (admin flow): notify all ASSIGNED therapists (duo inclus)
    if (!notifyAll && assignedTherapistIds.length > 0) {
      const assignedSet = new Set(assignedTherapistIds);
      eligibleTherapists = eligibleTherapists.filter(th => {
        const t = th.therapists as any;
        return t && assignedSet.has(t.id);
      });
      console.log(`Notifying ${assignedTherapistIds.length} assigned therapist(s)`);
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
      let customer: { email?: string | null; phone?: string | null; first_name?: string | null; last_name?: string | null; language?: string | null; civility?: string | null } | null = null;
      if ((booking as any).customer_id) {
        const { data: customerRow } = await supabaseClient
          .from('customers')
          .select('email, phone, first_name, last_name, language, civility')
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

        const firstName = customer?.first_name ?? booking.client_first_name ?? '';
        const lastName = customer?.last_name ?? booking.client_last_name ?? '';
        // Salutation courte ("Madame Dupont" si civilité, sinon le prénom), pour
        // les messages dont l'intro est rendue côté code (intro_text, SMS).
        const { greetingName } = clientGreeting(customer?.civility, firstName, lastName, resolvedLanguage);
        const clientPhone = customer?.phone ?? (booking as any).phone ?? '';

        // Contexte partagé pour les variables d'email. Le builder gère civilité,
        // nom client, dates, prix, durée, devise et logo du lieu. On passe les
        // noms/téléphone déjà résolus (fiche customer prioritaire sur les
        // colonnes booking) et les fallbacks marque pour contact/organisation.
        const emailCtx = {
          booking: {
            booking_id: booking.booking_id,
            client_first_name: firstName,
            client_last_name: lastName,
            room_number: booking.room_number,
            therapist_name: booking.therapist_name,
            total_price: booking.total_price,
            surcharge_amount: booking.surcharge_amount,
            is_out_of_hours: booking.is_out_of_hours,
            hotel_name: booking.hotel_name,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time,
          },
          venue: venueRow,
          civility: customer?.civility,
          lang: resolvedLanguage,
          treatments,
          clientPhone,
          bookingUrl: clientBookingUrl,
          contactEmail: venueContactEmail,
          organizationName: venueOrganizationName,
        };

        const isExternal = (booking as any).client_type === 'external';
        const isPending = booking.status === 'pending';
        // 'offert' = nothing to collect: never route to the payment-link branch,
        // let it fall through to the standard branch so the confirmation email
        // (or pending template) is sent like an already-paid booking.
        const isOffert = (booking as any).payment_status === 'offert';

        // If a payment method has already been registered for this booking
        // (e.g. client paid via SetupIntent in the client flow), skip the
        // Stripe payment-link branch and fall through to the standard pending
        // template. The payment-link branch is only for operator-created
        // external bookings where no card has been collected yet.
        //
        // Multi-booking (distinct slots per treatment): the card is saved once
        // for the whole group, attached to the FIRST booking only because
        // booking_payment_infos.stripe_session_id is UNIQUE. Sibling bookings
        // therefore have no payment_info row of their own — so we check the
        // whole group, otherwise siblings wrongly trigger a payment-link SMS.
        const groupId = (booking as any).booking_group_id as string | null;
        let hasPaymentMethod = false;
        if (groupId) {
          const { data: groupBookings } = await supabaseClient
            .from('bookings')
            .select('id')
            .eq('booking_group_id', groupId);
          const groupIds = (groupBookings || []).map((b: { id: string }) => b.id);
          if (groupIds.length > 0) {
            const { data: groupPaymentInfo } = await supabaseClient
              .from('booking_payment_infos')
              .select('id')
              .in('booking_id', groupIds)
              .limit(1);
            hasPaymentMethod = !!(groupPaymentInfo && groupPaymentInfo.length > 0);
          }
        } else {
          const { data: existingPaymentInfo } = await supabaseClient
            .from('booking_payment_infos')
            .select('id')
            .eq('booking_id', bookingId)
            .maybeSingle();
          hasPaymentMethod = !!existingPaymentInfo;
        }

        if (isExternal && !hasPaymentMethod && !isOffert && sendPaymentLink === false) {
          // Admin-created bookings (sendPaymentLink === false): do NOT auto-send
          // the Stripe payment link. The operator sends it manually from the
          // payment tab (FAB → SendPaymentLinkDialog). No client email here.
          console.log('[trigger-new-booking-notifications] sendPaymentLink=false → skipping auto payment-link for external booking:', bookingId);
        } else if (isExternal && !hasPaymentMethod && !isOffert) {
          // External clients: create a Stripe payment link and send the
          // payment-required email template instead of the standard confirmation.
          const language: 'fr' | 'en' = resolvedLanguage;
          console.log('[trigger-new-booking-notifications] external payment-link branch', { bookingId, language });

          const currency = venueCurrency;
          const currencySymbol = currency === 'eur' ? '€' : currency.toUpperCase();

          const totalPrice = Number(booking.total_price ?? treatmentPrice) || 0;

          const { client: stripe } = await getStripeForVenue(supabaseClient, booking.hotel_id);

          const paymentLink = await stripe.paymentLinks.create({
            line_items: [{
              price_data: {
                currency,
                product_data: {
                  name: language === 'fr'
                    ? `Prestations bien-être ${brand.name}`
                    : `${brand.name} Wellness Services`,
                  ...(treatmentName ? { description: treatmentName } : {}),
                },
                unit_amount: Math.round(totalPrice * 100),
              },
              quantity: 1,
            }],
            metadata: {
              booking_id: booking.id,
              booking_number: String(booking.booking_id),
              hotel_id: booking.hotel_id,
              source: 'payment_link',
            },
            after_completion: {
              type: 'redirect',
              redirect: {
                url: `${siteUrl}/client/${booking.hotel_id}/confirmation/${booking.id}?payment=success`,
              },
            },
          });

          const paymentUrl = `${paymentLink.url}?prefilled_email=${encodeURIComponent(clientEmail)}`;

          const now = new Date();
          const apptDate = new Date(`${booking.booking_date}T${booking.booking_time}`);
          const expiresAt = calculateExpirationDate(apptDate, now);
          const expiryLocale = language === 'fr' ? 'fr-FR' : 'en-US';
          const expiryDateText = `${expiresAt.toLocaleDateString(expiryLocale, {
            day: 'numeric', month: 'long',
          })} ${language === 'fr' ? 'à' : 'at'} ${expiresAt.toLocaleTimeString(expiryLocale, {
            hour: '2-digit', minute: '2-digit',
          })}`;

          const introText = language === 'fr'
            ? `Bonjour ${greetingName}, merci pour votre réservation. Pour la confirmer, veuillez procéder au paiement.`
            : `Hello ${greetingName}, thank you for your booking. To confirm it, please complete the payment.`;

          const templateVariables = buildPaymentLinkVars(emailCtx, {
            paymentUrl,
            expiryDate: expiryDateText,
            introText,
            totalAmount: totalPrice,
          });

          const templateId = language === 'fr'
            ? EXTERNAL_CLIENT_PAYMENT_TEMPLATE_FR
            : EXTERNAL_CLIENT_PAYMENT_TEMPLATE_EN;

          const subject = language === 'fr'
            ? `Réservation #${booking.booking_id} · Paiement requis`
            : `Booking #${booking.booking_id} · Payment required`;

          const clientEmailResult = await sendEmail({
            to: clientEmail,
            subject,
            templateId,
            templateVariables,
            audit: { bookingId, emailType: 'new_booking_notifications', metadata: { booking_number: booking.booking_id } },
          });

          if (clientEmailResult.error) {
            console.error('[trigger-new-booking-notifications] External client email error:', clientEmailResult.error);
          } else {
            console.log('[trigger-new-booking-notifications] External client payment email sent:', clientEmailResult.id);

            const channels: string[] = ['email'];

            if (clientPhone) {
              try {
                // Format date sans jour de semaine pour le SMS (ex: "30 avril").
                const smsDate = new Date(booking.booking_date).toLocaleDateString(
                  language === 'fr' ? 'fr-FR' : 'en-US',
                  { day: 'numeric', month: 'long' },
                );
                // URL = lien Stripe brut (sans ?prefilled_email=, plus court).
                // Vise 1 segment SMS. Accents basiques (a, e, e) restent en GSM-7.
                const smsBody = language === 'fr'
                  ? `Bonjour ${greetingName}, votre réservation chez ${booking.hotel_name ?? ''} le ${smsDate} à ${formattedTime} (${totalPrice}${currencySymbol}). Paiement : ${paymentLink.url}`
                  : `Hello ${greetingName}, your booking at ${booking.hotel_name ?? ''} on ${smsDate} at ${formattedTime} (${totalPrice}${currencySymbol}). Payment: ${paymentLink.url}`;
                const smsResult = await sendSms({ to: clientPhone, body: smsBody });
                if (smsResult.error) {
                  console.error('[trigger-new-booking-notifications][sms] External payment-link SMS error:', smsResult.error);
                } else {
                  console.log('[trigger-new-booking-notifications][sms] External payment-link SMS sent:', smsResult.sid);
                  channels.push('sms');
                }
              } catch (smsErr) {
                console.error('[trigger-new-booking-notifications][sms] External payment-link SMS exception:', smsErr);
              }
            } else {
              console.log('[trigger-new-booking-notifications][sms] No phone on customer/booking, skipping external SMS');
            }

            await supabaseClient
              .from('bookings')
              .update({
                payment_link_url: paymentLink.url,
                payment_link_sent_at: new Date().toISOString(),
                payment_link_channels: channels,
                payment_link_language: language,
              })
              .eq('id', bookingId);

            await supabaseClient
              .from('booking_payment_infos')
              .upsert({
                booking_id: bookingId,
                payment_link_stripe_id: paymentLink.id,
                payment_link_expires_at: expiresAt.toISOString(),
              }, { onConflict: 'booking_id' });
          }
        } else {
          const templateVariables = isPending
            ? buildPendingVars(emailCtx)
            : buildConfirmedVars(emailCtx);

          const clientLanguage: 'fr' | 'en' = resolvedLanguage;
          console.log('[trigger-new-booking-notifications] standard branch', { bookingId, clientLanguage, isPending });
          const pendingSubject = clientLanguage === 'en'
            ? `Booking request #${booking.booking_id} · ${booking.hotel_name ?? ''}`
            : `Demande de réservation #${booking.booking_id} · ${booking.hotel_name ?? ''}`;

          // Payment gate: a confirmed booking whose payment is not yet engaged
          // must NOT receive the confirmation email. The operator sends a payment
          // link manually; the confirmed email (CLIENT_NEW_BOOKING) is then sent
          // by the Stripe webhook once paid. Pending bookings still get the
          // pending template regardless of payment. 'offert' is treated as paid
          // (nothing to collect, no Stripe webhook will ever follow up).
          const PAID_STATUSES = ['paid', 'charged', 'charged_to_room', 'card_saved', 'pending_partner_billing', 'offert'];
          const isPaidEnough = PAID_STATUSES.includes((booking as any).payment_status);

          if (!isPending && !isPaidEnough) {
            console.log('[trigger-new-booking-notifications] Confirmed booking not paid yet → skipping client email:', bookingId);
          } else {
            const confirmedSubject = clientLanguage === 'en'
              ? `✅ Your treatment is confirmed · ${booking.hotel_name ?? ''}`
              : `✅ Votre soin est confirmé · ${booking.hotel_name ?? ''}`;
            // Attach the .ics to the confirmed email — mail clients auto-detect
            // it and offer "Add to calendar".
            let clientAttachments: EmailAttachment[] | undefined;
            if (!isPending) {
              const icsResult = buildBookingIcs({
                id: bookingId,
                booking_id: booking.booking_id,
                booking_date: booking.booking_date,
                booking_time: booking.booking_time,
                venue_name: venueRow?.name || booking.hotel_name,
                timezone: venueRow?.timezone,
                address: venueRow?.address,
                postal_code: venueRow?.postal_code,
                city: venueRow?.city,
                country: venueRow?.country,
                treatments,
              });
              if (icsResult) {
                clientAttachments = [{ filename: icsResult.filename, content: toBase64Utf8(icsResult.ics), contentType: "text/calendar" }];
              }
            }
            const clientEmailResult = await sendEmail({
              to: clientEmail,
              subject: isPending ? pendingSubject : confirmedSubject,
              from: transactionalFrom(clientLanguage),
              html: isPending
                ? getBookingPendingHtml(clientLanguage, templateVariables)
                : getBookingConfirmedHtml(clientLanguage, templateVariables),
              attachments: clientAttachments,
              audit: { bookingId, emailType: 'new_booking_notifications', metadata: { booking_number: booking.booking_id } },
            });

            if (clientEmailResult.error) {
              console.error('[trigger-new-booking-notifications] Client email error:', clientEmailResult.error);
            } else {
              console.log('[trigger-new-booking-notifications] Client email sent:', clientEmailResult.id);

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
      let therapistName: string | null = null;
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
