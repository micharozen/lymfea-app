import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { brand } from "../_shared/brand.ts";
import { format } from "https://esm.sh/date-fns@3.6.0";
import { fr, enUS } from "https://esm.sh/date-fns@3.6.0/locale";
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
          booking_date, booking_time, hotel_name, hotel_id, payment_link_language,
          payment_status, status, total_price, created_at, payment_link_url
        )
      `)
      .eq('bookings.payment_status', 'pending')
      .neq('bookings.status', 'cancelled')
      .not('payment_link_expires_at', 'is', null);

    if (fetchError) throw fetchError;

    for (const item of pendingReminders) {
      const b = item.bookings as any;
      const apptDate = new Date(`${b.booking_date}T${b.booking_time}`);
      // Temps restant avant le RDV
      const diffHoursToAppt = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Temps total entre la création de la réservation et le RDV
      const createdAt = new Date(b.created_at);
      const leadTimeHours = (apptDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      
      let shouldSend = false;

      // STRATÉGIE DE RELANCE (Basée sur le ticket)
      if (leadTimeHours > 48) {
        // 1er rappel : 48h avant RDV
        if (diffHoursToAppt <= 48 && diffHoursToAppt > 24 && item.payment_reminder_count === 0) shouldSend = true;
        // 2e rappel : 24h avant RDV
        if (diffHoursToAppt <= 24 && diffHoursToAppt > 0 && item.payment_reminder_count === 1) shouldSend = true;
      } 
      else if (leadTimeHours <= 48 && leadTimeHours > 24) {
        // 1 rappel à mi-chemin
        const expiresAt = new Date(item.payment_link_expires_at);
        const halfway = new Date(createdAt.getTime() + (expiresAt.getTime() - createdAt.getTime()) / 2);
        if (now >= halfway && item.payment_reminder_count === 0) shouldSend = true;
      }
      if (shouldSend && b.client_email) {
        const lang = (b.payment_link_language || 'fr') as 'fr' | 'en';
        
        // 1. Récupération des infos de l'hôtel (contacts)
        let contactEmail = brand.emails.from.default;
        let contactPhone = "";
        let hotelCurrency = 'eur';

        if (b.hotel_id) {
          const { data: hotel } = await supabase.from('hotels').select('currency').eq('id', b.hotel_id).single();
          if (hotel?.currency) hotelCurrency = hotel.currency.toLowerCase();
        }

        // 2. Récupération des soins
        const { data: bookingTreatments } = await supabase
          .from('booking_treatments')
          .select(`treatment_menus (name, price, duration)`)
          .eq('booking_id', b.id);

        const treatments = bookingTreatments?.map((bt: any) => ({
          name: bt.treatment_menus?.name || 'Service',
          price: bt.treatment_menus?.price || 0,
          duration: bt.treatment_menus?.duration
        })) || [];

        // 3. Formatage propre des dates
        const expiresAt = new Date(item.payment_link_expires_at);
        const timeFormatted = format(expiresAt, "HH:mm");
        const expiresAtText = lang === 'fr' 
          ? `${format(expiresAt, "d MMMM", { locale: fr })} à ${timeFormatted}`
          : `${format(expiresAt, "MMMM do", { locale: enUS })} at ${timeFormatted}`;

        const bookingDateObj = new Date(b.booking_date);
        const formattedBookingDate = lang === 'fr'
          ? bookingDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : bookingDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const currencySymbol = hotelCurrency === 'eur' ? '€' : hotelCurrency.toUpperCase();

        // 4. Construction des données du template
        const templateData: PaymentLinkTemplateData = {
          clientName: `${b.client_first_name} ${b.client_last_name}`,
          hotelName: b.hotel_name,
          bookingDate: formattedBookingDate,
          bookingTime: b.booking_time ? b.booking_time.substring(0, 5) : '',
          bookingNumber: b.booking_id,
          treatments: treatments,
          totalPrice: b.total_price,
          paymentUrl: b.payment_link_url || '#', 
          currency: currencySymbol,
          expiresAtText: expiresAtText,
          contactPhone: contactPhone,
          contactEmail: contactEmail
        };

        
        await resend.emails.send({
          from: Deno.env.get('IS_LOCAL') === 'true' ? 'onboarding@resend.dev' : brand.emails.from.default,
          to: Deno.env.get('IS_LOCAL') === 'true' ? 'romainthierryom@gmail.com' : b.client_email,
          subject: lang === 'fr'
            ? `Rappel : confirmez votre réservation du ${formattedBookingDate}`
            : `Reminder: confirm your booking on ${formattedBookingDate}`,
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