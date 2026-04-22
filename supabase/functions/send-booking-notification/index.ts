import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBookingNotificationRequest {
  bookingId: string;
  language: "fr" | "en";
  channels: ("email" | "sms")[];
  clientEmail?: string;
  clientPhone?: string;
}

interface BookingTreatment {
  name: string | null;
  price: number | null;
}

function formatPrice(amount: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatLongDate(dateIso: string, language: "fr" | "en") {
  const locale = language === "fr" ? "fr-FR" : "en-US";
  return new Date(dateIso).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildEmailHtml(params: {
  clientName: string;
  hotelName: string;
  bookingId: number;
  dateLong: string;
  bookingTime: string;
  roomNumber: string | null;
  treatments: BookingTreatment[];
  totalPrice: number;
  currency: string;
  language: "fr" | "en";
}) {
  const { clientName, hotelName, bookingId, dateLong, bookingTime, roomNumber, treatments, totalPrice, currency, language } = params;
  const labels = language === "fr"
    ? {
        title: "Votre réservation bien-être est confirmée",
        greeting: `Bonjour ${clientName},`,
        intro: `Votre réservation à ${hotelName} est confirmée.`,
        booking: `Réservation #${bookingId}`,
        roomLabel: "Chambre",
        totalLabel: "Total",
        partnerNotice: "Le montant sera facturé à l'hôtel — aucune démarche de paiement n'est nécessaire de votre part.",
        footer: "À très vite !",
      }
    : {
        title: "Your wellness booking is confirmed",
        greeting: `Hello ${clientName},`,
        intro: `Your booking at ${hotelName} is confirmed.`,
        booking: `Booking #${bookingId}`,
        roomLabel: "Room",
        totalLabel: "Total",
        partnerNotice: "The amount will be billed to the hotel — no payment action required on your side.",
        footer: "See you soon!",
      };

  const treatmentRows = treatments
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;">${t.name ?? "Service"}</td><td style="padding:6px 0;text-align:right;">${formatPrice(Number(t.price ?? 0), currency)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:Inter,Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px 0;">${labels.title}</h2>
  <p style="margin:0 0 12px 0;">${labels.greeting}</p>
  <p style="margin:0 0 16px 0;">${labels.intro}</p>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
    <p style="margin:0 0 4px 0;font-weight:600;">${labels.booking}</p>
    <p style="margin:0 0 4px 0;">${dateLong} — ${bookingTime}</p>
    ${roomNumber ? `<p style="margin:0 0 4px 0;">${labels.roomLabel} ${roomNumber}</p>` : ""}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${treatmentRows}
    <tr><td style="padding-top:8px;border-top:1px solid #e5e7eb;font-weight:600;">${labels.totalLabel}</td><td style="padding-top:8px;border-top:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatPrice(totalPrice, currency)}</td></tr>
  </table>
  <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px;color:#3730a3;font-size:13px;margin-bottom:16px;">
    ${labels.partnerNotice}
  </div>
  <p style="margin:0;">${labels.footer}</p>
</body></html>`;
}

function buildSmsBody(params: {
  clientName: string;
  hotelName: string;
  bookingId: number;
  dateLong: string;
  bookingTime: string;
  roomNumber: string | null;
  language: "fr" | "en";
}) {
  const { clientName, hotelName, bookingId, dateLong, bookingTime, roomNumber, language } = params;
  if (language === "fr") {
    return `Bonjour ${clientName}, votre soin à ${hotelName} est confirmé le ${dateLong} à ${bookingTime}. Réservation #${bookingId}${roomNumber ? `, chambre ${roomNumber}` : ""}. Facturation à l'hôtel, aucun paiement à prévoir. À très vite !`;
  }
  return `Hello ${clientName}, your treatment at ${hotelName} is confirmed on ${dateLong} at ${bookingTime}. Booking #${bookingId}${roomNumber ? `, room ${roomNumber}` : ""}. Billed to the hotel, no payment needed. See you soon!`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SendBookingNotificationRequest;
    const { bookingId, language, channels } = body;

    if (!bookingId || !language || !channels || channels.length === 0) {
      throw new Error("Missing required fields: bookingId, language and at least one channel");
    }

    if (!["fr", "en"].includes(language)) {
      throw new Error("Invalid language. Must be 'fr' or 'en'");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase env not configured");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `id, booking_id, client_first_name, client_last_name, client_email, phone,
         booking_date, booking_time, room_number, total_price, hotel_id,
         hotels(name, currency)`
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message ?? "unknown"}`);
    }

    const { data: treatments } = await supabase
      .from("booking_treatments")
      .select("treatment_menus(name, price)")
      .eq("booking_id", bookingId);

    const treatmentList: BookingTreatment[] = (treatments ?? []).map((row: any) => ({
      name: row.treatment_menus?.name ?? null,
      price: row.treatment_menus?.price ?? null,
    }));

    const hotel = (booking as any).hotels as { name?: string; currency?: string } | null;
    const hotelName = hotel?.name ?? "";
    const currency = hotel?.currency ?? "EUR";
    const clientName = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();
    const dateLong = formatLongDate(booking.booking_date, language);

    const errors: string[] = [];
    let emailSent = false;
    let smsSent = false;

    if (channels.includes("email")) {
      const to = body.clientEmail ?? booking.client_email;
      if (!to) {
        errors.push("No email address for recipient");
      } else {
        const html = buildEmailHtml({
          clientName,
          hotelName,
          bookingId: booking.booking_id,
          dateLong,
          bookingTime: booking.booking_time.substring(0, 5),
          roomNumber: booking.room_number ?? null,
          treatments: treatmentList,
          totalPrice: Number(booking.total_price ?? 0),
          currency,
          language,
        });
        const subject = language === "fr"
          ? `Confirmation de votre réservation #${booking.booking_id}`
          : `Your booking confirmation #${booking.booking_id}`;
        const result = await sendEmail({ to, subject, html });
        if (result.error) {
          errors.push(`Email: ${result.error}`);
        } else {
          emailSent = true;
        }
      }
    }

    if (channels.includes("sms")) {
      const to = body.clientPhone ?? booking.phone;
      if (!to) {
        errors.push("No phone number for recipient");
      } else {
        const smsBody = buildSmsBody({
          clientName,
          hotelName,
          bookingId: booking.booking_id,
          dateLong,
          bookingTime: booking.booking_time.substring(0, 5),
          roomNumber: booking.room_number ?? null,
          language,
        });
        const result = await sendSms({ to, body: smsBody });
        if (result.error) {
          errors.push(`SMS: ${result.error}`);
        } else {
          smsSent = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: emailSent || smsSent,
        emailSent,
        smsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: emailSent || smsSent ? 200 : 500,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-booking-notification] error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
