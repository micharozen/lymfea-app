import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";
import { buildModifiedVars, type PreviousSlot } from "../_shared/booking-email-vars.ts";
import { getBookingModifiedHtml } from "../_shared/templates/booking-modified.ts";
import type { NotifyContext } from "./types.ts";

/** Colonnes du lieu attendues par les gabarits (adresse, logo, politique…). */
const VENUE_SELECT = `organization_id, name, address, access_instructions,
  access_instructions_en, postal_code, city, country, timezone, website_url,
  contact_email, image, currency, cancellation_policy_text_en,
  cancellation_policy_text_fr, organizations(name)`;

/**
 * E-mail « réservation modifiée ».
 *
 * Rendu ici plutôt que délégué : le gabarit partagé attend le lieu complet
 * (adresse, logo, politique d'annulation) et les soins détaillés, que la
 * fonction d'envoi générique ne charge pas. C'est aussi le premier pas de la
 * migration des gabarits vers `notify`.
 */
export async function sendModifiedEmail(
  ctx: NotifyContext,
  to: string,
): Promise<{ sent: boolean; error?: string }> {
  const { supabase, booking, language } = ctx;

  const [{ data: venue }, { data: treatmentRows }, { data: customer }] = await Promise.all([
    supabase.from("hotels").select(VENUE_SELECT).eq("id", booking.hotel_id).single(),
    supabase
      .from("booking_treatments")
      .select(
        "price_override, treatment_menus(name, price, duration, amenity_id), treatment_variants(label, price, duration)",
      )
      .eq("booking_id", booking.id),
    booking.customer_id
      ? supabase.from("customers").select("civility, phone").eq("id", booking.customer_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const treatments = (treatmentRows ?? []).map((row: Record<string, any>) => {
    const menu = row.treatment_menus as Record<string, any> | null;
    const variant = row.treatment_variants as Record<string, any> | null;
    return {
      name: variant?.label ? `${menu?.name ?? ""} — ${variant.label}` : (menu?.name ?? ""),
      price: resolveTreatmentPrice(row),
      duration: variant?.duration ?? menu?.duration ?? 0,
      is_amenity: !!menu?.amenity_id,
    };
  });

  const siteUrl = (Deno.env.get("SITE_URL") || `https://${brand.appDomain}`).replace(/\/+$/, "");
  const manageUrl = `${siteUrl}/booking/manage/${booking.id}`;

  const vars = buildModifiedVars(
    {
      booking: {
        booking_id: booking.booking_id,
        client_first_name: booking.client_first_name,
        client_last_name: booking.client_last_name,
        phone: booking.phone,
        hotel_name: booking.hotel_name,
        booking_date: booking.booking_date,
        booking_time: booking.booking_time,
        total_price: booking.total_price,
        surcharge_amount: booking.surcharge_amount,
        is_out_of_hours: booking.is_out_of_hours,
        room_number: booking.room_number,
      },
      venue: venue as never,
      civility: (customer as { civility?: string | null } | null)?.civility ?? null,
      lang: language,
      treatments,
      bookingUrl: manageUrl,
      clientPhone: (customer as { phone?: string | null } | null)?.phone ?? null,
      variant: "client",
      bookingStatus: booking.status,
    },
    (ctx.context.previous ?? null) as PreviousSlot | null,
  );

  const subject = language === "en"
    ? `Your booking #${booking.booking_id} has been updated`
    : `Modification de votre réservation #${booking.booking_id}`;

  const { error } = await sendEmail({
    to,
    subject,
    html: getBookingModifiedHtml(language, vars),
    audit: {
      bookingId: booking.id,
      emailType: "booking_modified",
      metadata: { booking_number: booking.booking_id },
    },
  });

  return { sent: !error, error: error ?? undefined };
}
