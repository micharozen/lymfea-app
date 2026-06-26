import { brand } from "../../_shared/brand.ts";
import { ensurePaymentLinkForBooking } from "../../_shared/client-booking-summary.ts";
import { sendPaymentLinkEmail } from "../../_shared/payment-link-email.ts";
import {
  PaymentLinkTemplateData,
} from "../../_shared/payment-link-templates.ts";
import {
  sendWhatsAppTemplate,
  buildPaymentLinkTemplateMessage,
} from "../../_shared/whatsapp-meta.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SendPaymentLinkBody {
  bookingId: string;
  language: "fr" | "en";
  channels?: ("email" | "whatsapp")[];
  clientEmail?: string;
  clientPhone?: string;
  mode?: "generate" | "send";
  forceResend?: boolean;
}

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
    const oneHourBeforeAppt = new Date(
      bookingDate.getTime() - 1 * 60 * 60 * 1000,
    );
    return twoHoursLater < oneHourBeforeAppt ? twoHoursLater : oneHourBeforeAppt;
  }
  return new Date(now.getTime() + 1 * 60 * 60 * 1000);
}

export async function handleSendPaymentLink(
  ctx: ActionContext,
): Promise<Response> {
  const { body, supabase, stripe: defaultStripe } = ctx;

  try {
    const { bookingId, language, channels, clientEmail, clientPhone, mode = "send", forceResend } =
      body as SendPaymentLinkBody;

    if (!bookingId || !language) {
      throw new Error("Missing required fields: bookingId and language");
    }
    if (mode === "send" && (!channels || channels.length === 0)) {
      throw new Error(
        "Missing required fields: at least one channel required when mode=send",
      );
    }
    if (!["fr", "en"].includes(language)) {
      throw new Error("Invalid language. Must be 'fr' or 'en'");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
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
        client_type,
        payment_link_sent_at,
        hotel_id,
        hotel_name,
        therapist_name
      `,
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(
        `Booking not found: ${bookingError?.message || "unknown error"}`,
      );
    }

    let stripe = defaultStripe;
    if (booking.hotel_id) {
      const resolved = await getStripeForVenue(supabase, booking.hotel_id);
      stripe = resolved.client;
    }

    if (mode === "generate") {
      const linkResult = await ensurePaymentLinkForBooking(
        supabase,
        bookingId,
        stripe,
        language,
      );
      if ("error" in linkResult) {
        throw new Error(linkResult.error);
      }
      return jsonResponse({
        success: true,
        paymentLinkUrl: linkResult.paymentLinkUrl,
      });
    }

    const sendChannels = channels ?? [];

    let hotelCurrency = "eur";
    const contactEmail = brand.emails.from.default;
    const contactPhone = "";
    let hotelImageUrl = "";
    let hotelTimezone = "Europe/Paris";

    if (booking.hotel_id) {
      const cleanHotelId = booking.hotel_id.trim();
      const { data: hotel } = await supabase
        .from("hotels")
        .select("currency, cover_image, image, timezone")
        .eq("id", cleanHotelId)
        .maybeSingle();
      if (hotel) {
        if (hotel.timezone) hotelTimezone = hotel.timezone;
        if (hotel.currency) hotelCurrency = hotel.currency.toLowerCase();
        hotelImageUrl = hotel.cover_image || hotel.image || "";
      }
    }

    if (booking.payment_status === "paid") {
      throw new Error("Booking is already paid");
    }
    if (booking.status === "cancelled") {
      throw new Error("Cannot send payment link for cancelled booking");
    }

    const { data: bookingTreatments, error: treatmentsError } = await supabase
      .from("booking_treatments")
      .select(`treatment_menus ( id, name, price, duration )`)
      .eq("booking_id", bookingId);

    if (treatmentsError) throw new Error("Failed to fetch treatments");

    const treatments =
      bookingTreatments?.map(
        (bt: {
          treatment_menus?: { name?: string; price?: number; duration?: number };
        }) => ({
          name: bt.treatment_menus?.name || "Service",
          price: bt.treatment_menus?.price || 0,
          duration: bt.treatment_menus?.duration,
        }),
      ) || [];

    const verifiedTotalPrice = treatments.reduce(
      (sum, t) => sum + t.price,
      0,
    );
    const totalPrice =
      verifiedTotalPrice > 0 ? verifiedTotalPrice : booking.total_price;

    const currency = hotelCurrency;
    const currencySymbol = currency === "eur" ? "€" : currency.toUpperCase();

    const email = clientEmail || booking.client_email;
    const phone = clientPhone || booking.phone;

    if (email && !booking.client_email) {
      await supabase
        .from("bookings")
        .update({ client_email: email })
        .eq("id", bookingId);
    }

    if (sendChannels.includes("email") && !email) {
      throw new Error("Email address required for email channel");
    }
    if (sendChannels.includes("whatsapp") && !phone) {
      throw new Error("Phone number required for WhatsApp channel");
    }

    const now = new Date();
    const apptDate = new Date(`${booking.booking_date}T${booking.booking_time}`);
    const expiresAt = calculateExpirationDate(apptDate, now);
    const diffInHours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const urgency: "normal" | "urgent" | "very_urgent" | "immediate" =
      diffInHours <= 2
        ? "immediate"
        : diffInHours <= 6
          ? "very_urgent"
          : diffInHours <= 24
            ? "urgent"
            : "normal";

    const expiresAtText = (() => {
      const tz = hotelTimezone;
      const locale = language === "fr" ? "fr-FR" : "en-US";
      const datePart = new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        day: "numeric",
        month: "long",
      }).format(expiresAt);
      const timePart = new Intl.DateTimeFormat("fr-FR", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(expiresAt);
      return language === "fr"
        ? `${datePart} à ${timePart}`
        : `${datePart} at ${timePart}`;
    })();

    const linkResult = await ensurePaymentLinkForBooking(
      supabase,
      bookingId,
      stripe,
      language,
    );
    if ("error" in linkResult) {
      throw new Error(linkResult.error);
    }
    const paymentLinkUrl = email
      ? `${linkResult.paymentLinkUrl}?prefilled_email=${encodeURIComponent(email)}`
      : linkResult.paymentLinkUrl;

    const bookingDate = new Date(booking.booking_date);
    const formattedDate =
      language === "fr"
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
      clientName: `${booking.client_first_name} ${booking.client_last_name}`,
      hotelName: booking.hotel_name || "Hotel",
      hotelImageUrl,
      roomNumber: booking.room_number || undefined,
      bookingDate: formattedDate,
      bookingTime: booking.booking_time
        ? booking.booking_time.substring(0, 5)
        : "",
      bookingNumber: booking.booking_id,
      treatments,
      totalPrice,
      paymentUrl: paymentLinkUrl,
      currency: currencySymbol,
      expiresAtText,
      contactPhone,
      contactEmail,
      urgency,
    };

    const results: { email?: boolean; whatsapp?: boolean; errors: string[] } = {
      errors: [],
    };

    if (sendChannels.includes("email") && email) {
      try {
        const emailResult = await sendPaymentLinkEmail({
          supabase,
          bookingId,
          language,
          forceResend: !!forceResend,
          clientEmail: email,
          prepared: {
            paymentLinkUrl: linkResult.paymentLinkUrl,
            templateData,
            isExternal: booking.client_type === "external",
            paymentLinkSentAt: booking.payment_link_sent_at,
          },
        });

        if (!emailResult.success) {
          throw new Error(emailResult.error || emailResult.skipped || "Email failed");
        }
        if (emailResult.skipped === "payment_link_already_sent" && !forceResend) {
          results.email = true;
        } else if (emailResult.emailSent) {
          results.email = true;
        } else if (emailResult.skipped === "already_paid") {
          throw new Error("Booking is already paid");
        }
      } catch (emailError) {
        const msg =
          emailError instanceof Error ? emailError.message : "Unknown error";
        results.errors.push(`Email: ${msg}`);
      }
    }

    if (sendChannels.includes("whatsapp") && phone) {
      try {
        const treatmentsList = treatments.map((t) => t.name).join(", ");
        const therapistName =
          booking.therapist_name ||
          (language === "fr"
            ? `Votre professionnel ${brand.name}`
            : `Your ${brand.name} professional`);

        const template = buildPaymentLinkTemplateMessage(
          language,
          templateData.clientName,
          therapistName,
          templateData.hotelName,
          templateData.bookingDate,
          templateData.bookingTime,
          templateData.bookingNumber,
          treatmentsList,
          `${totalPrice}${currencySymbol}`,
          linkResult.paymentLinkUrl,
        );

        const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
        const whatsappResult = await sendWhatsAppTemplate(
          formattedPhone,
          template,
        );

        if (!whatsappResult.success) {
          throw new Error(whatsappResult.error || "Failed to send WhatsApp");
        }
        results.whatsapp = true;
      } catch (whatsappError) {
        const msg =
          whatsappError instanceof Error
            ? whatsappError.message
            : "Unknown error";
        results.errors.push(`WhatsApp: ${msg}`);
      }
    }

    const sentChannels = sendChannels.filter(
      (c) =>
        (c === "email" && results.email) ||
        (c === "whatsapp" && results.whatsapp),
    );

    if (sentChannels.length > 0) {
      await supabase
        .from("bookings")
        .update({
          payment_link_url: linkResult.paymentLinkUrl,
          payment_link_sent_at: new Date().toISOString(),
          payment_link_channels: sentChannels,
          payment_link_language: language,
        })
        .eq("id", bookingId);

      await supabase.from("booking_payment_infos").upsert(
        {
          booking_id: bookingId,
          payment_link_expires_at: expiresAt.toISOString(),
        },
        { onConflict: "booking_id" },
      );
    }

    const atLeastOneSuccess = results.email || results.whatsapp;
    if (!atLeastOneSuccess) {
      throw new Error(
        `Failed to send payment link: ${results.errors.join("; ")}`,
      );
    }

    // Historique de la réservation : log de l'envoi du lien de paiement
    try {
      const authHeader = ctx.req.headers.get("Authorization");
      let actorUserId: string | null = null;
      if (authHeader) {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: userData } = await userClient.auth.getUser();
        actorUserId = userData?.user?.id ?? null;
      }

      const sentChannels = sendChannels.filter(
        (c) =>
          (c === "email" && results.email) ||
          (c === "whatsapp" && results.whatsapp),
      );

      await supabase.from("audit_log").insert({
        table_name: "bookings",
        record_id: bookingId,
        changed_by: actorUserId,
        change_type: "action",
        old_values: null,
        new_values: {
          action: "payment_link_sent",
          channels: sentChannels,
          language,
          email: results.email ? email : undefined,
          phone: results.whatsapp ? phone : undefined,
          has_preview: results.email === true,
        },
        source: "admin",
        metadata: {
          booking_id: booking.booking_id,
          payment_link_url: linkResult.paymentLinkUrl,
        },
        resend_email_id: null,
      });
    } catch (auditError) {
      console.warn("[SEND-PAYMENT-LINK] Failed to write audit log:", auditError);
    }

    return jsonResponse({
      success: true,
      paymentLinkUrl: linkResult.paymentLinkUrl,
      emailSent: results.email || false,
      whatsappSent: results.whatsapp || false,
      expiresAt: expiresAt.toISOString(),
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[SEND-PAYMENT-LINK] Error:", msg);
    return jsonResponse({ error: msg }, 400);
  }
}
