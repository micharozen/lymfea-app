import { brand } from "../../_shared/brand.ts";
import { sendEmail } from "../../_shared/send-email.ts";
import { getPaymentCancellationEmailHtml } from "../../_shared/payment-link-templates.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
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

interface ExpiredLinkBooking {
  id: string;
  client_first_name: string | null;
  client_last_name: string | null;
  client_email: string | null;
  booking_date: string;
  payment_link_language: string | null;
  payment_status: string | null;
  status: string | null;
  hotel_id: string | null;
  booking_treatments?: Array<{
    treatment_id: string;
    treatment_menus?: { slug?: string };
  }>;
}

export async function handleCheckExpiredPaymentLinks(
  ctx: ActionContext,
): Promise<Response> {
  const { supabase, stripe: defaultStripe } = ctx;

  try {
    console.log("[CRON] Checking for expired payment links...");

    const { data: expiredLinks, error: fetchError } = await supabase
      .from("booking_payment_infos")
      .select(
        `
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
            treatment_id,
            treatment_menus ( slug )
          )
        )
      `,
      )
      .lt("payment_link_expires_at", new Date().toISOString())
      .eq("bookings.payment_status", "pending")
      .neq("bookings.status", "cancelled");

    if (fetchError) throw fetchError;
    if (!expiredLinks || expiredLinks.length === 0) {
      return jsonResponse({ message: "No expired links found" });
    }

    for (const item of expiredLinks) {
      const booking = (
        Array.isArray(item.bookings) ? item.bookings[0] : item.bookings
      ) as ExpiredLinkBooking | null;

      if (item.payment_link_stripe_id) {
        try {
          // Use the venue's Stripe client when the link was created on it
          let stripe = defaultStripe;
          if (booking?.hotel_id) {
            const resolved = await getStripeForVenue(supabase, booking.hotel_id);
            stripe = resolved.client;
          }
          await stripe.paymentLinks.update(item.payment_link_stripe_id, {
            active: false,
          });
        } catch (e) {
          console.error(
            `[STRIPE] Error disabling link for booking ${item.booking_id}:`,
            e,
          );
        }
      }

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", item.booking_id);
      if (updateError) {
        console.error(
          `[DB] Error cancelling booking ${item.booking_id}:`,
          updateError,
        );
        continue;
      }

      await supabase
        .from("booking_payment_infos")
        .update({ cancellation_reason: "payment_link_expired" })
        .eq("booking_id", item.booking_id);

      if (booking && booking.client_email) {
        try {
          const lang = (booking.payment_link_language || "fr") as "fr" | "en";
          const bookingDateObj = new Date(booking.booking_date);
          const formattedBookingDate =
            lang === "fr"
              ? bookingDateObj.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                })
              : bookingDateObj.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                });
          const siteUrl = Deno.env.get("SITE_URL") || brand.website;

          let hotelSlugOrId: string | null = booking.hotel_id;
          if (booking.hotel_id) {
            const { data: hotelRow } = await supabase
              .from("hotels")
              .select("slug")
              .eq("id", booking.hotel_id)
              .maybeSingle();
            hotelSlugOrId = hotelRow?.slug || booking.hotel_id;
          }

          const treatmentSlugs = (booking.booking_treatments || [])
            .map((bt) => bt.treatment_menus?.slug)
            .filter(Boolean)
            .join(",");

          let bookingUrl = hotelSlugOrId
            ? `${siteUrl}/client/${hotelSlugOrId}/treatments`
            : brand.website;
          if (treatmentSlugs) bookingUrl += `?t=${treatmentSlugs}`;

          await sendEmail({
            to: booking.client_email,
            subject:
              lang === "fr"
                ? `Votre réservation du ${formattedBookingDate} a été annulée`
                : `Your booking on ${formattedBookingDate} has been cancelled`,
            html: getPaymentCancellationEmailHtml(lang, {
              clientName: `${booking.client_first_name} ${booking.client_last_name}`,
              bookingDate: formattedBookingDate,
              bookingUrl,
            }),
            audit: { bookingId: item.booking_id, emailType: 'payment_link_expired' },
          });
        } catch (e) {
          console.error(
            `[EMAIL] Failed to send email for booking ${item.booking_id}:`,
            e,
          );
        }
      }
    }

    return jsonResponse({ success: true, count: expiredLinks.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CRON] Global error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
}
