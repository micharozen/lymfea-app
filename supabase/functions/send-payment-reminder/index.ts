import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { brand } from "../_shared/brand.ts";
import { getPaymentReminderEmailHtml, PaymentLinkTemplateData } from "../_shared/payment-link-templates.ts";

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    console.log("[CRON] Checking for pending payments to remind...");

    // 1. On récupère les bookings en attente qui ont un lien de paiement
    const { data: pendingReminders, error: fetchError } = await supabase
      .from('booking_payment_infos')
      .select(`
        *,
        bookings (
          id, booking_id, client_first_name, client_last_name, client_email,
          booking_date, booking_time, hotel_name, payment_link_language,
          payment_status, status, total_price, created_at
        )
      `)
      .is('bookings.payment_status', 'pending')
      .neq('bookings.status', 'cancelled')
      .not('payment_link_expires_at', 'is', null);

    if (fetchError) throw fetchError;

    for (const item of pendingReminders) {
      const b = item.bookings as any;
      const apptDate = new Date(`${b.booking_date}T${b.booking_time}`);
      const diffHoursToAppt = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      let shouldSend = false;

      // STRATÉGIE DE RELANCE (Basée sur le ticket)
      if (diffHoursToAppt > 48) {
        // Cas > 48h : Relance à 48h et 24h
        if (diffHoursToAppt <= 48 && item.payment_reminder_count === 0) shouldSend = true;
        if (diffHoursToAppt <= 24 && item.payment_reminder_count === 1) shouldSend = true;
      } 
      else if (diffHoursToAppt <= 48 && diffHoursToAppt > 24) {
        // Cas 24h-48h : 1 rappel à mi-chemin
        const createdAt = new Date(b.created_at);
        const expiresAt = new Date(item.payment_link_expires_at);
        const halfway = new Date(createdAt.getTime() + (expiresAt.getTime() - createdAt.getTime()) / 2);
        
        if (now >= halfway && item.payment_reminder_count === 0) shouldSend = true;
      }

      if (shouldSend && b.client_email) {
        const lang = (b.payment_link_language || 'fr') as 'fr' | 'en';
        
        // Données pour le template
        const templateData: PaymentLinkTemplateData = {
          clientName: `${b.client_first_name} ${b.client_last_name}`,
          hotelName: b.hotel_name,
          bookingDate: b.booking_date,
          bookingTime: b.booking_time,
          bookingNumber: b.booking_id,
          treatments: [], // Optionnel ici si on simplifie le rappel
          totalPrice: b.total_price,
          paymentUrl: b.payment_link_url, // URL déjà stockée dans bookings
          expiresAtText: new Date(item.payment_link_expires_at).toLocaleTimeString()
        };

        await resend.emails.send({
          from: brand.emails.from.default,
          to: b.client_email,
          subject: lang === 'fr' ? "Rappel : Votre réservation Lymfea" : "Reminder: Your Lymfea Booking",
          html: getPaymentReminderEmailHtml(lang, templateData),
        });

        // 2. Incrémenter le compteur pour ne pas relancer en boucle
        await supabase
          .from('booking_payment_infos')
          .update({ 
            payment_reminder_count: (item.payment_reminder_count || 0) + 1,
            payment_last_reminder_at: now.toISOString()
          })
          .eq('booking_id', item.booking_id);
          
        console.log(`[REMINDER] Sent to ${b.client_email} for booking ${b.id}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});