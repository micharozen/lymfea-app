/**
 * Admin payment-link email — uses existing HTML templates (payment-link-templates.ts).
 * Idempotent: skips if payment_link_sent_at unless forceResend.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import { ensurePaymentLinkForBooking } from "./client-booking-summary.ts";
import {
  getExternalClientPaymentEmailHtml,
  getPaymentLinkEmailHtml,
  getPaymentLinkEmailSubject,
  type PaymentLinkTemplateData,
} from "./payment-link-templates.ts";
import { sendEmail } from "./send-email.ts";

function calculateExpirationDate(bookingDate: Date, now: Date): Date {
  const diffInHours =
    (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffInHours > 48) {
    return new Date(bookingDate.getTime() - 24 * 60 * 60 * 1000);
  }
  if (diffInHours > 24) {
    return new Date(bookingDate.getTime() - 6 * 60 * 60 * 1000);
  }
  if (diffInHours > 6) {
    return new Date(bookingDate.getTime() - 3 * 60 * 60 * 1000);
  }
  if (diffInHours > 2) {
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneHourBeforeAppt = new Date(
      bookingDate.getTime() - 1 * 60 * 60 * 1000,
    );
    return twoHoursLater < oneHourBeforeAppt
      ? twoHoursLater
      : oneHourBeforeAppt;
  }
  return new Date(now.getTime() + 1 * 60 * 60 * 1000);
}

export interface SendPaymentLinkEmailOptions {
  supabase: SupabaseClient;
  bookingId: string;
  language: "fr" | "en";
  stripe?: Stripe;
  forceResend?: boolean;
  clientEmail?: string;
  /** When set by sendPaymentLink, skips re-fetch + Stripe link creation. */
  prepared?: {
    paymentLinkUrl: string;
    templateData: PaymentLinkTemplateData;
    isExternal: boolean;
    paymentLinkSentAt?: string | null;
  };
}

export interface SendPaymentLinkEmailResult {
  success: boolean;
  skipped?: string;
  emailSent?: boolean;
  paymentLinkUrl?: string;
  error?: string;
}

export async function sendPaymentLinkEmail(
  options: SendPaymentLinkEmailOptions,
): Promise<SendPaymentLinkEmailResult> {
  const { supabase, bookingId, language, forceResend = false, prepared } = options;

  if (prepared) {
    const email = options.clientEmail;
    if (!email) {
      return { success: false, error: "No client email" };
    }
    if (prepared.paymentLinkSentAt && !forceResend) {
      return {
        success: true,
        skipped: "payment_link_already_sent",
        paymentLinkUrl: prepared.paymentLinkUrl,
      };
    }

    const paymentUrl = `${prepared.paymentLinkUrl}?prefilled_email=${encodeURIComponent(email)}`;
    const html = prepared.isExternal
      ? getExternalClientPaymentEmailHtml(language, {
        ...prepared.templateData,
        paymentUrl,
      })
      : getPaymentLinkEmailHtml(language, {
        ...prepared.templateData,
        paymentUrl,
      });

    const emailResult = await sendEmail({
      to: email,
      subject: getPaymentLinkEmailSubject(language, {
        ...prepared.templateData,
        paymentUrl,
      }),
      html,
    });

    if (emailResult.error) {
      return { success: false, error: emailResult.error };
    }

    await supabase
      .from("bookings")
      .update({
        payment_link_url: prepared.paymentLinkUrl,
        payment_link_sent_at: new Date().toISOString(),
        payment_link_channels: ["email"],
        payment_link_language: language,
      })
      .eq("id", bookingId);

    console.log(`[payment-link-email] Sent (prepared) for booking ${bookingId}`);
    return {
      success: true,
      emailSent: true,
      paymentLinkUrl: prepared.paymentLinkUrl,
    };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      `id, booking_id, client_first_name, client_last_name, client_email, client_type,
       room_number, booking_date, booking_time, total_price, payment_status,
       payment_link_url, payment_link_sent_at, hotel_id, hotel_name,
       hotels(cover_image, image, currency, timezone, contact_email)`,
    )
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    console.error("[payment-link-email] Booking fetch failed:", bookingError?.message);
    return { success: false, error: bookingError?.message || "Booking not found" };
  }

  if (booking.payment_status === "paid") {
    return { success: true, skipped: "already_paid" };
  }

  if (booking.payment_link_sent_at && !forceResend) {
    return {
      success: true,
      skipped: "payment_link_already_sent",
      paymentLinkUrl: booking.payment_link_url ?? undefined,
    };
  }

  const email = options.clientEmail || booking.client_email;
  if (!email) {
    return { success: false, error: "No client email" };
  }

  if (options.clientEmail && !booking.client_email) {
    await supabase
      .from("bookings")
      .update({ client_email: email })
      .eq("id", bookingId);
  }

  const linkResult = await ensurePaymentLinkForBooking(
    supabase,
    bookingId,
    options.stripe,
    language,
  );
  if ("error" in linkResult) {
    return { success: false, error: linkResult.error };
  }

  const paymentUrl = email
    ? `${linkResult.paymentLinkUrl}?prefilled_email=${encodeURIComponent(email)}`
    : linkResult.paymentLinkUrl;

  const { data: bookingTreatments } = await supabase
    .from("booking_treatments")
    .select("treatment_menus(name, price, duration)")
    .eq("booking_id", bookingId);

  const treatments = (bookingTreatments ?? []).map((row) => {
    const menu = row.treatment_menus as {
      name?: string;
      price?: number;
      duration?: number;
    } | null;
    return {
      name: menu?.name || "Service",
      price: Number(menu?.price) || 0,
      duration: Number(menu?.duration) || 0,
    };
  });

  const hotel = booking.hotels as {
    cover_image?: string;
    image?: string;
    currency?: string;
    timezone?: string;
    contact_email?: string;
  } | null;

  const hotelTimezone = hotel?.timezone || "Europe/Paris";
  const currency = (hotel?.currency || "EUR").toUpperCase();
  const currencySymbol = currency === "EUR" ? "€" : currency;
  const totalPrice = treatments.reduce((sum, t) => sum + t.price, 0) ||
    Number(booking.total_price) || 0;

  const now = new Date();
  const apptDate = new Date(`${booking.booking_date}T${booking.booking_time}`);
  const expiresAt = calculateExpirationDate(apptDate, now);
  const diffInHours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const urgency: PaymentLinkTemplateData["urgency"] = diffInHours <= 2
    ? "immediate"
    : diffInHours <= 6
    ? "very_urgent"
    : diffInHours <= 24
    ? "urgent"
    : "normal";

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const expiresAtText = `${expiresAt.toLocaleDateString(locale, {
    timeZone: hotelTimezone,
    day: "numeric",
    month: "long",
  })} ${language === "fr" ? "à" : "at"} ${
    expiresAt.toLocaleTimeString("fr-FR", {
      timeZone: hotelTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }`;

  const bookingDate = new Date(booking.booking_date);
  const formattedDate = language === "fr"
    ? bookingDate.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : bookingDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const templateData: PaymentLinkTemplateData = {
    clientName: `${booking.client_first_name} ${booking.client_last_name}`.trim(),
    hotelName: booking.hotel_name || "Hotel",
    hotelImageUrl: hotel?.cover_image || hotel?.image,
    roomNumber: booking.room_number || undefined,
    bookingDate: formattedDate,
    bookingTime: booking.booking_time?.substring(0, 5) ?? "",
    bookingNumber: booking.booking_id,
    treatments,
    totalPrice,
    paymentUrl,
    currency: currencySymbol,
    expiresAtText,
    contactEmail: hotel?.contact_email,
    urgency,
  };

  const isExternal = booking.client_type === "external";
  const html = isExternal
    ? getExternalClientPaymentEmailHtml(language, templateData)
    : getPaymentLinkEmailHtml(language, templateData);

  const emailResult = await sendEmail({
    to: email,
    subject: getPaymentLinkEmailSubject(language, templateData),
    html,
  });

  if (emailResult.error) {
    return { success: false, error: emailResult.error };
  }

  await supabase
    .from("bookings")
    .update({
      payment_link_url: linkResult.paymentLinkUrl,
      payment_link_sent_at: new Date().toISOString(),
      payment_link_channels: ["email"],
      payment_link_language: language,
    })
    .eq("id", bookingId);

  console.log(`[payment-link-email] Sent for booking ${bookingId}`);
  return {
    success: true,
    emailSent: true,
    paymentLinkUrl: linkResult.paymentLinkUrl,
  };
}
