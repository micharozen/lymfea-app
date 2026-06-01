import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { brand } from "../_shared/brand.ts";
import {
  getPaymentLinkEmailSubject,
  getPaymentLinkEmailHtml,
  getExternalClientPaymentEmailHtml,
  PaymentLinkTemplateData
} from '../_shared/payment-link-templates.ts';
import { sendSms } from '../_shared/send-sms.ts';
import { getStripeForVenue } from '../_shared/stripe-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendPaymentLinkRequest {
  bookingId: string;
  language: 'fr' | 'en';
  channels?: ('email' | 'sms')[];
  clientEmail?: string;
  clientPhone?: string;
  smsBody?: string;
  mode?: 'generate' | 'send';
}

function buildDefaultSmsBody(
  language: 'fr' | 'en',
  clientFirstName: string,
  hotelName: string,
  bookingDate: string,
  bookingTime: string,
  totalText: string,
): string {
  if (language === 'fr') {
    return `Bonjour ${clientFirstName}, votre réservation chez ${hotelName} le ${bookingDate} à ${bookingTime} (${totalText}). Merci de régler via le lien ci-dessous :`;
  }
  return `Hello ${clientFirstName}, your booking at ${hotelName} on ${bookingDate} at ${bookingTime} (${totalText}). Please pay via the link below:`;
}
function generateICS(bookingDate: string, bookingTime: string, hotelName: string, durationMinutes: number, timezone: string = 'Europe/Paris'): string {
  // 1. On sépare manuellement pour éviter que le serveur décale l'heure
  const [year, month, day] = bookingDate.split('-').map(Number);
  const [hour, minute] = bookingTime.split(':').map(Number);
  
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const end = new Date(start.getTime() + durationMinutes * 60000);

  // 2. Formatage strict
  const formatDate = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
  };

  // 3. Construction du fichier avec le TZID (Timezone ID)
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lymfea//Booking//EN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=${timezone}:${formatDate(start)}`, // 👈 C'est ÇA qui fixe le bug
    `DTEND;TZID=${timezone}:${formatDate(end)}`,
    `SUMMARY:Soin Lymfea - ${hotelName}`,
    `LOCATION:${hotelName}`,
    `DESCRIPTION:Votre moment de bien-être chez ${hotelName}.`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

// Fonction utilitaire pour le calcul de l'expiration selon les règles du ticket
function calculateExpirationDate(bookingDate: Date, now: Date): Date {
  const diffInHours = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffInHours > 48) {
    return new Date(bookingDate.getTime() - 24 * 60 * 60 * 1000);
  } else if (diffInHours > 24) {
    return new Date(bookingDate.getTime() - 6 * 60 * 60 * 1000);
  } else if (diffInHours > 6) {
    return new Date(bookingDate.getTime() - 3 * 60 * 60 * 1000);
  } else if (diffInHours > 2) {
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneHourBeforeAppt = new Date(bookingDate.getTime() - 1 * 60 * 60 * 1000);
    return twoHoursLater < oneHourBeforeAppt ? twoHoursLater : oneHourBeforeAppt;
  } else {
    return new Date(now.getTime() + 1 * 60 * 60 * 1000);
  }
}

// Correction ici : ajout du type Request
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[SEND-PAYMENT-LINK] Starting payment link generation");

    const { bookingId, language, channels, clientEmail, clientPhone, smsBody, mode = 'send' } = await req.json() as SendPaymentLinkRequest;

    if (!bookingId || !language) {
      throw new Error("Missing required fields: bookingId and language");
    }

    if (mode === 'send' && (!channels || channels.length === 0)) {
      throw new Error("At least one channel required when mode='send'");
    }

    if (!['fr', 'en'].includes(language)) {
      throw new Error("Invalid language. Must be 'fr' or 'en'");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_id,
        client_first_name,
        client_last_name,
        client_email,
        phone,
        room_number,
        booking_date,
        booking_time,
        total_price,
        payment_status,
        status,
        payment_method,
        hotel_id,
        hotel_name,
        therapist_name
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[SEND-PAYMENT-LINK] Booking fetch error:", bookingError);
      throw new Error(`Booking not found: ${bookingError?.message || 'unknown error'}`);
    }

    let hotelCurrency = 'eur';
    let contactEmail = brand.emails.from.default;
    let contactPhone = "";
    let hotelImageUrl = "";
    let hotelTimezone = "Europe/Paris";
  if (booking.hotel_id) {
      const cleanHotelId = booking.hotel_id.trim();
      
      const { data: hotel, error: hotelError } = await supabase
        .from('hotels')
        .select('currency, cover_image, image, timezone')
        .eq('id', cleanHotelId)
        .maybeSingle();

      if (hotelError) {
        console.error("[SEND-PAYMENT-LINK] Hotel fetch error:", hotelError.message);
      }

      if (hotel) {
        if (hotel.timezone) hotelTimezone = hotel.timezone;
        if (hotel.currency) hotelCurrency = hotel.currency.toLowerCase();
        hotelImageUrl = hotel.cover_image || hotel.image || "";
      } else {
        console.warn("[SEND-PAYMENT-LINK] No hotel found for id:", cleanHotelId);
      }
    }

    if (booking.payment_status === 'paid') {
      throw new Error("Booking is already paid");
    }

    if (booking.status === 'cancelled') {
      throw new Error("Cannot send payment link for cancelled booking");
    }

    const { data: bookingTreatments, error: treatmentsError } = await supabase
      .from('booking_treatments')
      .select(`
        treatment_menus (
          id,
          name,
          price,
          duration
        )
      `)
      .eq('booking_id', bookingId);

    if (treatmentsError) {
      console.error("[SEND-PAYMENT-LINK] Treatments fetch error:", treatmentsError);
      throw new Error("Failed to fetch treatments");
    }

    const treatments = bookingTreatments?.map((bt: any) => ({
      name: bt.treatment_menus?.name || 'Service',
      price: bt.treatment_menus?.price || 0,
      duration: bt.treatment_menus?.duration
    })) || [];

    if (treatments.length === 0) {
      console.warn(`[SEND-PAYMENT-LINK] No booking_treatments found for booking ${bookingId} — booking may be corrupted`);
    }

    // Correction ici : ajout des types sum et t
    const verifiedTotalPrice = treatments.reduce((sum: number, t: any) => sum + t.price, 0);
    const totalPrice = verifiedTotalPrice > 0 ? verifiedTotalPrice : booking.total_price;

    const currency = hotelCurrency;
    const currencySymbol = currency === 'eur' ? '€' : currency.toUpperCase();

    const email = clientEmail || booking.client_email;
    const phone = clientPhone || booking.phone;

    // Persist email to booking if it wasn't already saved
    if (email && !booking.client_email) {
      await supabase.from('bookings').update({ client_email: email }).eq('id', bookingId);
    }

    if (mode === 'send' && channels?.includes('email') && !email) {
      throw new Error("Email address required for email channel");
    }

    if (mode === 'send' && channels?.includes('sms') && !phone) {
      throw new Error("Phone number required for SMS channel");
    }

    // Calcul de l'expiration
    const now = new Date();
    const apptDate = new Date(`${booking.booking_date}T${booking.booking_time}`);
    const expiresAt = calculateExpirationDate(apptDate, now);

    // Calcul du niveau d'urgence selon le délai restant avant le RDV
    const diffInHours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const urgency: 'normal' | 'urgent' | 'very_urgent' | 'immediate' =
      diffInHours <= 2 ? 'immediate' :
      diffInHours <= 6 ? 'very_urgent' :
      diffInHours <= 24 ? 'urgent' :
      'normal';

    // Formatage de l'expiration dans le fuseau horaire du spa (Deno tourne en UTC)
    const expiresAtText = (() => {
      const tz = hotelTimezone;
      const locale = language === 'fr' ? 'fr-FR' : 'en-US';
      const datePart = new Intl.DateTimeFormat(locale, { timeZone: tz, day: 'numeric', month: 'long' }).format(expiresAt);
      const timePart = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(expiresAt);
      return language === 'fr' ? `${datePart} à ${timePart}` : `${datePart} at ${timePart}`;
    })();

    console.log("[SEND-PAYMENT-LINK] Creating Stripe Payment Link");

    const resolvedStripe = await getStripeForVenue(supabase, booking.hotel_id);
    const stripe = resolvedStripe.client;
    console.log(`[SEND-PAYMENT-LINK] Stripe source=${resolvedStripe.source} hotel=${booking.hotel_id}`);

    // Réutiliser l'ancien Payment Link s'il existe, est actif, non expiré et porte le même montant
    const { data: existingPaymentInfos } = await supabase
      .from('booking_payment_infos')
      .select('payment_link_stripe_id, payment_link_expires_at')
      .eq('booking_id', bookingId)
      .maybeSingle();

    let paymentLink: { id: string; url: string } | null = null;

    if (existingPaymentInfos?.payment_link_stripe_id) {
      try {
        const existing = await stripe.paymentLinks.retrieve(existingPaymentInfos.payment_link_stripe_id);
        const expiresAtMs = existingPaymentInfos.payment_link_expires_at
          ? new Date(existingPaymentInfos.payment_link_expires_at).getTime()
          : 0;
        const stillValid = existing.active && expiresAtMs > now.getTime();
        const sameAmount = existing.line_items?.data?.[0]?.amount_total
          ? existing.line_items.data[0].amount_total === Math.round(totalPrice * 100)
          : true; // line_items not always expanded; assume ok

        if (stillValid && sameAmount) {
          paymentLink = { id: existing.id, url: existing.url };
          console.log("[SEND-PAYMENT-LINK] Reusing existing payment link:", existing.id);
        } else {
          await stripe.paymentLinks.update(existingPaymentInfos.payment_link_stripe_id, { active: false });
          console.log("[SEND-PAYMENT-LINK] Deactivated old payment link:", existingPaymentInfos.payment_link_stripe_id);
        }
      } catch (deactivateError) {
        console.warn("[SEND-PAYMENT-LINK] Failed to retrieve/deactivate old payment link:", deactivateError);
      }
    }

    if (!paymentLink) {
      const siteUrl = Deno.env.get("SITE_URL") || brand.website;
      const treatmentNames = treatments.map((t: any) => t.name).join(', ');

      const created = await stripe.paymentLinks.create({
        line_items: [{
          price_data: {
            currency: currency,
            product_data: {
              name: language === 'fr' ? `Prestations bien-être ${brand.name}` : `${brand.name} Wellness Services`,
              ...(treatmentNames.trim() ? { description: treatmentNames } : {}),
            },
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        }],
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_id.toString(),
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
      paymentLink = { id: created.id, url: created.url };
      console.log("[SEND-PAYMENT-LINK] Payment link created:", created.url);
    }

    const stripePaymentLinkId = paymentLink.id;
    const bookingDate = new Date(booking.booking_date);
    const formattedDate = language === 'fr'
      ? bookingDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : bookingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      


    const templateData: PaymentLinkTemplateData = {
      clientName: `${booking.client_first_name} ${booking.client_last_name}`,
      hotelName: booking.hotel_name || 'Hotel',
      hotelImageUrl: hotelImageUrl,
      roomNumber: booking.room_number || undefined,
      bookingDate: formattedDate,
      bookingTime: booking.booking_time ? booking.booking_time.substring(0, 5) : '',
      bookingNumber: booking.booking_id,
      treatments: treatments,
      totalPrice: totalPrice,
      paymentUrl: email ? `${paymentLink.url}?prefilled_email=${encodeURIComponent(email)}` : paymentLink.url,
      currency: currencySymbol,
      expiresAtText: expiresAtText,
      contactPhone: contactPhone,
      contactEmail: contactEmail,
      urgency: urgency,
    };

    const results: { email?: boolean; sms?: boolean; errors: string[] } = { errors: [] };

    // En mode 'generate', on persiste le lien et on retourne sans envoyer
    if (mode === 'generate') {
      const { error: paymentInfosError } = await supabase
        .from('booking_payment_infos')
        .upsert({
          booking_id: bookingId,
          payment_link_stripe_id: stripePaymentLinkId,
          payment_link_expires_at: expiresAt.toISOString(),
        }, { onConflict: 'booking_id' });

      if (paymentInfosError) {
        console.error("[SEND-PAYMENT-LINK] Error saving payment infos (generate):", paymentInfosError);
      }

      await supabase
        .from('bookings')
        .update({ payment_link_url: paymentLink.url })
        .eq('id', bookingId);

      return new Response(
        JSON.stringify({
          success: true,
          paymentLinkUrl: paymentLink.url,
          emailSent: false,
          smsSent: false,
          expiresAt: expiresAt.toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (channels?.includes('email') && email) {
      try {
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        
        // Sélection du template : Luxe pour client externe, Standard pour client hôtel
        const isExternal = !booking.room_number || 
                           booking.room_number.trim().toUpperCase() === 'TDB' || 
                           booking.room_number.trim().toUpperCase() === 'TBD';
                           
        const html = isExternal 
          ? getExternalClientPaymentEmailHtml(language, templateData)
          : getPaymentLinkEmailHtml(language, templateData);

        // 1. Calcul de la durée totale des soins
        const totalDuration = treatments.reduce((sum: number, t: any) => sum + (t.duration || 60), 0);
        
        // 2. Génération du fichier ICS
        const icsContent = generateICS(booking.booking_date, booking.booking_time, booking.hotel_name, totalDuration, hotelTimezone);

        // 3. Envoi de l'e-mail avec la pièce jointe
        const emailResult = await resend.emails.send({
          from: Deno.env.get('IS_LOCAL') === 'true' ? 'onboarding@resend.dev' : brand.emails.from.default,
          to: Deno.env.get('IS_LOCAL') === 'true' ? 'romainthierryom@gmail.com' : email,
          subject: getPaymentLinkEmailSubject(language, templateData),
          html: html,
          attachments: [
            {
              filename: 'reservation-lymfea.ics',
              content: icsContent
            }
          ]
        });

        console.log("[SEND-PAYMENT-LINK] Email sent:", emailResult);
        results.email = true;
      } catch (emailError: any) {
        console.error("[SEND-PAYMENT-LINK] Email error:", emailError);
        results.errors.push(`Email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`);
      }
    }

    if (channels?.includes('sms') && phone) {
      try {
        const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const totalText = `${totalPrice}${currencySymbol}`;
        const baseBody = (smsBody && smsBody.trim().length > 0)
          ? smsBody.trim()
          : buildDefaultSmsBody(
              language,
              booking.client_first_name,
              templateData.hotelName,
              templateData.bookingDate,
              templateData.bookingTime,
              totalText,
            );

        const finalBody = `${baseBody}\n${paymentLink.url}`;

        const smsResult = await sendSms({ to: formattedPhone, body: finalBody });

        if (smsResult.error) {
          throw new Error(smsResult.error);
        }

        console.log("[SEND-PAYMENT-LINK] SMS sent via Twilio:", smsResult.sid);
        results.sms = true;
      } catch (smsError: any) {
        console.error("[SEND-PAYMENT-LINK] SMS error:", smsError);
        results.errors.push(`SMS: ${smsError instanceof Error ? smsError.message : 'Unknown error'}`);
      }
    }

    // Mise à jour de la table bookings
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_link_url: paymentLink.url,
        payment_link_sent_at: new Date().toISOString(),
        payment_link_channels: (channels ?? []).filter(c =>
          (c === 'email' && results.email) || (c === 'sms' && results.sms)
        ),
        payment_link_language: language,
      })
      .eq('id', bookingId);

    // Mise à jour de booking_payment_infos avec les nouvelles colonnes
    // Mise à jour ou Création (Upsert) de booking_payment_infos
   // --- NOUVEAU BLOC : SAUVEGARDE DE L'EXPIRATION ---
    const { error: paymentInfosError } = await supabase
      .from('booking_payment_infos')
      .upsert({ 
        booking_id: bookingId,
        payment_link_stripe_id: stripePaymentLinkId,
        payment_link_expires_at: expiresAt.toISOString(),
      }, { onConflict: 'booking_id' });

    if (paymentInfosError) {
      console.error("[SEND-PAYMENT-LINK] Error saving payment infos:", paymentInfosError);
    }

    if (updateError || paymentInfosError) {
      console.error("[SEND-PAYMENT-LINK] DB Update error:", updateError || paymentInfosError);
    }

    const atLeastOneSuccess = results.email || results.sms;

    if (!atLeastOneSuccess) {
      throw new Error(`Failed to send payment link: ${results.errors.join('; ')}`);
    }

    // Historique de la réservation : log de l'envoi du lien de paiement
    try {
      const authHeader = req.headers.get('Authorization');
      let actorUserId: string | null = null;
      if (authHeader) {
        const userClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: userData } = await userClient.auth.getUser();
        actorUserId = userData?.user?.id ?? null;
      }

      const sentChannels = [
        ...(results.email ? ['email'] : []),
        ...(results.sms ? ['sms'] : []),
      ];

      await supabase.from('audit_log').insert({
        table_name: 'bookings',
        record_id: bookingId,
        changed_by: actorUserId,
        change_type: 'action',
        old_values: null,
        new_values: {
          action: 'payment_link_sent',
          channels: sentChannels,
          language,
          email: results.email ? email : undefined,
          phone: results.sms ? phone : undefined,
        },
        source: 'admin',
        metadata: {
          booking_id: booking.booking_id,
          payment_link_url: paymentLink.url,
        },
      });
    } catch (auditError) {
      console.warn('[SEND-PAYMENT-LINK] Failed to write audit log:', auditError);
    }

    console.log("[SEND-PAYMENT-LINK] Completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        paymentLinkUrl: paymentLink.url,
        emailSent: results.email || false,
        smsSent: results.sms || false,
        expiresAt: expiresAt.toISOString(),
        errors: results.errors.length > 0 ? results.errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SEND-PAYMENT-LINK] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});