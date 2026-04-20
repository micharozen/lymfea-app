import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getPaymentCancellationEmailHtml } from "../_shared/payment-link-templates.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});


serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("[CRON] Checking for expired payment links...");

    const { data: expiredLinks, error: fetchError } = await supabase
      .from('booking_payment_infos')
      .select(`
        booking_id,
        payment_link_stripe_id,
        payment_link_expires_at,
        bookings (
          id,
          client_first_name,
          client_last_name,
          client_email,
          booking_date,
          payment_link_language,
          payment_status,
          status,
          hotel_id,
          booking_treatments (
            treatment_id
          )
        )
      `)
      .lt('payment_link_expires_at', new Date().toISOString())
      .eq('bookings.payment_status', 'pending')
      .neq('bookings.status', 'cancelled');

    if (fetchError) throw fetchError;
    if (!expiredLinks || expiredLinks.length === 0) {
      return new Response(JSON.stringify({ message: "No expired links found" }), { status: 200 });
    }

    console.log(`[CRON] Found ${expiredLinks.length} links to expire`);

    for (const item of expiredLinks) {
      // GESTION DU TABLEAU SUPABASE : Si c'est un tableau, on prend le premier élément
      const booking = Array.isArray(item.bookings) ? item.bookings[0] : item.bookings;

      if (item.payment_link_stripe_id) {
        try {
          await stripe.paymentLinks.update(item.payment_link_stripe_id, { active: false });
          console.log(`[STRIPE] Disabled link ${item.payment_link_stripe_id}`);
        } catch (e) {
          console.error(`[STRIPE] Error disabling link for booking ${item.booking_id}:`, e);
        }
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', item.booking_id);

      if (updateError) {
        console.error(`[DB] Error cancelling booking ${item.booking_id}:`, updateError);
        continue;
      }

      await supabase
        .from('booking_payment_infos')
        .update({ cancellation_reason: 'payment_link_expired' })
        .eq('booking_id', item.booking_id);

      // 4. Envoyer l'email d'annulation
      if (booking && booking.client_email) {
        try {
          const lang = (booking.payment_link_language || 'fr') as 'fr' | 'en';
          const bookingDateObj = new Date(booking.booking_date);
          const formattedBookingDate = lang === 'fr'
            ? bookingDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
            : bookingDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
          const siteUrl = Deno.env.get('SITE_URL') || brand.website;

          const treatmentIds = booking.booking_treatments
            ?.map((bt: { treatment_id: string }) => bt.treatment_id)
            .join(',') || '';

          let bookingUrl = brand.website;
          if (booking.hotel_id) {
            bookingUrl = `${siteUrl}/client/${booking.hotel_id}/treatments`;
            if (treatmentIds) {
              bookingUrl += `?treatments=${treatmentIds}`;
            }
          }

          console.log(`[CRON] Envoi de l'email d'annulation à ${booking.client_email}...`);
          
          await sendEmail({
            to: booking.client_email,
            subject: lang === 'fr'
              ? `Votre réservation du ${formattedBookingDate} a été annulée`
              : `Your booking on ${formattedBookingDate} has been cancelled`,
            html: getPaymentCancellationEmailHtml(lang, {
              clientName: `${booking.client_first_name} ${booking.client_last_name}`,
              bookingDate: formattedBookingDate,
              bookingUrl,
            }),
          });
          console.log(`[EMAIL] ✅ Sent cancellation to ${booking.client_email}`);
        } catch (e) {
          console.error(`[EMAIL] ❌ Failed to send email for booking ${item.booking_id}:`, e);
        }
      } else {
        console.log(`[CRON] ⚠️ Aucun email client trouvé pour le booking ${item.booking_id}`);
      }
    }

    return new Response(JSON.stringify({ success: true, count: expiredLinks.length }), { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CRON] Global error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});