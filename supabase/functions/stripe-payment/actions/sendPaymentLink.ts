import { brand } from "../../_shared/brand.ts";
import {
  PaymentLinkTemplateData,
} from "../../_shared/payment-link-templates.ts";
import { sendEmail } from "../../_shared/send-email.ts";
import {
  sendWhatsAppTemplate,
  buildPaymentLinkTemplateMessage,
} from "../../_shared/whatsapp-meta.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import { resolveTreatmentPrice } from "../../_shared/treatmentPrice.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { ActionContext } from "../index.ts";

// Resend templates "Booking Payment Link" (FR/EN) — same template variables.
const PAYMENT_LINK_TEMPLATE_FR = "3edb6ede-b627-4727-9eaa-f8fdf845975b";
const PAYMENT_LINK_TEMPLATE_EN = "6ba59c67-04e3-412e-9a84-246aaa7dc570";

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
  channels: ("email" | "whatsapp")[];
  clientEmail?: string;
  clientPhone?: string;
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
    const { bookingId, language, channels, clientEmail, clientPhone } =
      body as SendPaymentLinkBody;

    if (!bookingId || !language || !channels || channels.length === 0) {
      throw new Error(
        "Missing required fields: bookingId, language, and at least one channel required",
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
      .select(`price_override, treatment_menus ( id, name, price, duration ), treatment_variants ( price )`)
      .eq("booking_id", bookingId);

    if (treatmentsError) throw new Error("Failed to fetch treatments");

    const treatments =
      bookingTreatments?.map(
        (bt: {
          price_override?: number | null;
          treatment_menus?: { name?: string; price?: number; duration?: number };
          treatment_variants?: { price?: number | null } | null;
        }) => ({
          name: bt.treatment_menus?.name || "Service",
          price: resolveTreatmentPrice(bt),
          duration: bt.treatment_menus?.duration,
        }),
      ) || [];

    // Override-aware live sum; fall back to total_price only when there are no lines.
    const verifiedTotalPrice = treatments.reduce(
      (sum, t) => sum + t.price,
      0,
    );
    const totalPrice =
      treatments.length > 0 ? verifiedTotalPrice : booking.total_price;

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

    if (channels.includes("email") && !email) {
      throw new Error("Email address required for email channel");
    }
    if (channels.includes("whatsapp") && !phone) {
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

    const siteUrl = Deno.env.get("SITE_URL") || brand.website;
    const treatmentNames = treatments.map((t) => t.name).join(", ");

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name:
                language === "fr"
                  ? `Prestations bien-être ${brand.name}`
                  : `${brand.name} Wellness Services`,
              ...(treatmentNames.trim() ? { description: treatmentNames } : {}),
            },
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: booking.id,
        booking_number: booking.booking_id.toString(),
        hotel_id: booking.hotel_id,
        source: "payment_link",
      },
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${siteUrl}/client/${booking.hotel_id}/confirmation/${booking.id}?payment=success`,
        },
      },
    });

    const stripePaymentLinkId = paymentLink.id;
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
      paymentUrl: email
        ? `${paymentLink.url}?prefilled_email=${encodeURIComponent(email)}`
        : paymentLink.url,
      currency: currencySymbol,
      expiresAtText,
      contactPhone,
      contactEmail,
      urgency,
    };

    const results: { email?: boolean; whatsapp?: boolean; errors: string[] } = {
      errors: [],
    };
    // Resend id of the payment-link email, stored on the history row so the
    // "Aperçu" button can fetch the rendered template body on demand.
    let resendEmailId: string | null = null;

    if (channels.includes("email") && email) {
      try {
        const totalDuration = treatments.reduce(
          (sum, t) => sum + (t.duration || 60),
          0,
        );

        // Variables du template Resend (mêmes clés que trigger-new-booking-notifications)
        const introText =
          language === "fr"
            ? `Bonjour ${booking.client_first_name}, merci pour votre réservation. Pour la confirmer, veuillez procéder au paiement.`
            : `Hello ${booking.client_first_name}, thank you for your booking. To confirm it, please complete the payment.`;

        const templateVariables: Record<string, string> = {
          booking_date: templateData.bookingDate,
          booking_number: String(booking.booking_id ?? ""),
          booking_time: templateData.bookingTime,
          expiry_date: expiresAtText,
          intro_text: introText,
          payment_url: templateData.paymentUrl,
          total_price: `${totalPrice}${currencySymbol}`,
          treatment_duration: `${totalDuration} min`,
          treatment_name: treatments.map((t) => t.name).filter(Boolean).join(", "),
          treatment_price: `${totalPrice}${currencySymbol}`,
          venue_name: templateData.hotelName,
        };

        const templateId =
          language === "fr" ? PAYMENT_LINK_TEMPLATE_FR : PAYMENT_LINK_TEMPLATE_EN;

        // Pas de subject : on laisse celui défini dans le template Resend.
        const emailResult = await sendEmail({
          to: email,
          templateId,
          templateVariables,
        });

        if (emailResult.error) {
          throw new Error(emailResult.error);
        }
        results.email = true;
        resendEmailId = emailResult.id ?? null;
      } catch (emailError) {
        const msg =
          emailError instanceof Error ? emailError.message : "Unknown error";
        results.errors.push(`Email: ${msg}`);
      }
    }

    if (channels.includes("whatsapp") && phone) {
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
          paymentLink.url,
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

    await supabase
      .from("bookings")
      .update({
        payment_link_url: paymentLink.url,
        payment_link_sent_at: new Date().toISOString(),
        payment_link_channels: channels.filter(
          (c) =>
            (c === "email" && results.email) ||
            (c === "whatsapp" && results.whatsapp),
        ),
        payment_link_language: language,
      })
      .eq("id", bookingId);

    await supabase.from("booking_payment_infos").upsert(
      {
        booking_id: bookingId,
        payment_link_stripe_id: stripePaymentLinkId,
        payment_link_expires_at: expiresAt.toISOString(),
      },
      { onConflict: "booking_id" },
    );

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

      const sentChannels = channels.filter(
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
          // Template email body lives at Resend; flag drives the "Aperçu" button.
          has_preview: resendEmailId != null,
        },
        source: "admin",
        metadata: {
          booking_id: booking.booking_id,
          payment_link_url: paymentLink.url,
        },
        resend_email_id: resendEmailId,
      });
    } catch (auditError) {
      console.warn("[SEND-PAYMENT-LINK] Failed to write audit log:", auditError);
    }

    return jsonResponse({
      success: true,
      paymentLinkUrl: paymentLink.url,
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
