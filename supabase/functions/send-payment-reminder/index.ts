import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getPaymentReminderEmailHtml, PaymentLinkTemplateData } from "../_shared/payment-link-templates.ts";

serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    console.log("[CRON] Checking for pending payments to remind...");

    const { data: pendingReminders, error: fetchError } = await supabase
      .from('booking_payment_infos')
      .select(`
        booking_id,
        payment_link_expires_at,
        payment_reminder_count,
        payment_last_reminder_at,
        bookings (
          id,
          client_first_name,
          client_last_name,
          client_email,
          booking_date,
          booking_time,
          hotel_name,
          hotel_id,
          payment_link_language,
          payment_status,
          status,
          total_price,
          created_at,
          payment_link_url
        )
      `)
      .not('payment_link_expires_at', 'is', null)
      .gt('payment_link_expires_at', now.toISOString());

    if (fetchError) throw fetchError;
    if (!pendingReminders || pendingReminders.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders to send" }), { status: 200 });
    }

    let sent = 0;

    for (const item of pendingReminders) {
      const b = Array.isArray(item.bookings) ? item.bookings[0] : item.bookings;

      // Filter in JS — PostgREST join filters on related tables can silently include nulls
      if (!b || b.payment_status !== 'pending' || b.status === 'cancelled') continue;
      if (!b.client_email || !b.payment_link_url) continue;

      // booking_time est en heure locale du spa — on force l'interprétation UTC
      // pour que diffHoursToAppt soit calculé depuis le même référentiel que now
      const apptDate = new Date(`${b.booking_date}T${b.booking_time}Z`);
      const diffHoursToAppt = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Appointment has already passed
      if (diffHoursToAppt <= 0) continue;

      const createdAt = new Date(b.created_at);
      const leadTimeHours = (apptDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      const reminderCount = item.payment_reminder_count ?? 0;

      let shouldSend = false;

      if (leadTimeHours > 48) {
        // 1st reminder at 48h before, 2nd at 24h before
        if (diffHoursToAppt <= 48 && diffHoursToAppt > 24 && reminderCount === 0) shouldSend = true;
        if (diffHoursToAppt <= 24 && diffHoursToAppt > 0 && reminderCount === 1) shouldSend = true;
      } else if (leadTimeHours > 24) {
        // Single reminder at the halfway point between creation and expiry
        const expiresAt = new Date(item.payment_link_expires_at);
        const halfway = new Date(createdAt.getTime() + (expiresAt.getTime() - createdAt.getTime()) / 2);
        if (now >= halfway && reminderCount === 0) shouldSend = true;
      }
      // leadTimeHours <= 24: no reminder (too short a window)

      if (!shouldSend) continue;

      // Fetch hotel currency
      let hotelCurrency = 'eur';
      let hotelTz = 'Europe/Paris';
      if (b.hotel_id) {
        const { data: hotel } = await supabase
          .from('hotels')
          .select('currency, timezone')
          .eq('id', b.hotel_id)
          .maybeSingle();
        if (hotel?.currency) hotelCurrency = hotel.currency.toLowerCase();
        if (hotel?.timezone) hotelTz = hotel.timezone;
      }

      // Fetch booking treatments
      const { data: bookingTreatments } = await supabase
        .from('booking_treatments')
        .select('treatment_menus (name, price, duration)')
        .eq('booking_id', b.id);

      const treatments = (bookingTreatments ?? []).map((bt: { treatment_menus?: { name?: string; price?: number; duration?: number } }) => ({
        name: bt.treatment_menus?.name || 'Service',
        price: bt.treatment_menus?.price || 0,
        duration: bt.treatment_menus?.duration,
      }));

      const lang = ((b.payment_link_language || 'fr') as 'fr' | 'en');
      const expiresAt = new Date(item.payment_link_expires_at);
      const expiresAtText = (() => {
        const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
        const datePart = new Intl.DateTimeFormat(locale, { timeZone: hotelTz, day: 'numeric', month: 'long' }).format(expiresAt);
        const timePart = new Intl.DateTimeFormat('fr-FR', { timeZone: hotelTz, hour: '2-digit', minute: '2-digit', hour12: false }).format(expiresAt);
        return lang === 'fr' ? `${datePart} à ${timePart}` : `${datePart} at ${timePart}`;
      })();

      const bookingDateObj = new Date(b.booking_date);
      const formattedBookingDate = lang === 'fr'
        ? bookingDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : bookingDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

      const currencySymbol = hotelCurrency === 'eur' ? '€' : hotelCurrency.toUpperCase();

      const templateData: PaymentLinkTemplateData = {
        clientName: `${b.client_first_name} ${b.client_last_name}`,
        hotelName: b.hotel_name,
        bookingDate: formattedBookingDate,
        bookingTime: b.booking_time ? b.booking_time.substring(0, 5) : '',
        bookingNumber: item.booking_id,
        treatments,
        totalPrice: b.total_price,
        paymentUrl: b.payment_link_url,
        currency: currencySymbol,
        expiresAtText,
        contactPhone: '',
        contactEmail: brand.emails.from.default,
      };

      const emailResult = await sendEmail({
        to: b.client_email,
        subject: lang === 'fr'
          ? `Rappel : confirmez votre réservation du ${formattedBookingDate}`
          : `Reminder: confirm your booking on ${formattedBookingDate}`,
        html: getPaymentReminderEmailHtml(lang, templateData),
      });

      if (emailResult.error) {
        console.error(`[REMINDER] ❌ Email error for booking ${item.booking_id}:`, emailResult.error);
        continue;
      }

      await supabase
        .from('booking_payment_infos')
        .update({
          payment_reminder_count: reminderCount + 1,
          payment_last_reminder_at: now.toISOString(),
        })
        .eq('booking_id', item.booking_id);

      console.log(`[REMINDER] ✅ Sent to ${b.client_email} for booking ${item.booking_id}`);
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent }), { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CRON] Global error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
