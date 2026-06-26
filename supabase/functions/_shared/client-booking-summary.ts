/**
 * Stripe payment link helpers for admin payment-link emails.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import { brand } from "./brand.ts";
import { getStripeForVenue } from "./stripe-resolver.ts";

export async function bookingHasSavedCard(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("booking_payment_infos")
    .select("payment_status, stripe_payment_method_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return data?.payment_status === "card_saved" &&
    !!data?.stripe_payment_method_id;
}

interface TreatmentLine {
  name: string;
  price: number;
  duration: number;
  slotLabel?: string;
}

interface GroupContext {
  canonicalId: string;
  bookingIds: string[];
  bookings: Record<string, unknown>[];
  totalPrice: number;
  treatments: TreatmentLine[];
  treatmentListText: string;
  treatmentName: string;
  treatmentDuration: number;
  treatmentPrice: number;
  bookingDate: string;
  bookingTime: string;
  bookingNumber: string;
}

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

async function loadGroupContext(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<GroupContext> {
  const groupId = booking.booking_group_id as string | null;
  let bookings: Record<string, unknown>[] = [booking];
  if (groupId) {
    const { data: siblings } = await supabase
      .from("bookings")
      .select(
        "id, booking_id, booking_group_id, booking_date, booking_time, total_price, hotel_id, client_email, payment_link_url",
      )
      .eq("booking_group_id", groupId)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true })
      .order("id", { ascending: true });
    if (siblings?.length) bookings = siblings as Record<string, unknown>[];
  }
  const canonical = bookings[0];
  const canonicalId = canonical.id as string;
  const bookingIds = bookings.map((b) => b.id as string);
  const treatments: TreatmentLine[] = [];
  for (const b of bookings) {
    const { data: rows } = await supabase
      .from("booking_treatments")
      .select("treatment_menus(name, price, duration)")
      .eq("booking_id", b.id as string);
    const slotDate = new Date(b.booking_date as string).toLocaleDateString(
      "fr-FR",
      { weekday: "short", day: "numeric", month: "short" },
    );
    const slotTime = ((b.booking_time as string) ?? "").substring(0, 5);
    const slotLabel = bookings.length > 1 ? `${slotDate} ${slotTime}` : undefined;
    for (const row of rows ?? []) {
      const menu = row.treatment_menus as {
        name?: string;
        price?: number;
        duration?: number;
      } | null;
      const name = menu?.name || "Soin";
      treatments.push({
        name: slotLabel ? `${name} (${slotLabel})` : name,
        price: Number(menu?.price) || 0,
        duration: Number(menu?.duration) || 0,
        slotLabel,
      });
    }
  }
  const totalPrice = bookings.reduce(
    (sum, b) => sum + (Number(b.total_price) || 0),
    0,
  );
  const treatmentPrice = treatments.reduce((sum, t) => sum + t.price, 0);
  const treatmentDuration = treatments.reduce((sum, t) => sum + t.duration, 0);
  const treatmentName = treatments.map((t) => t.name).filter(Boolean).join(", ");
  const treatmentListText = treatments
    .map((t) =>
      t.slotLabel
        ? `• ${t.name} — ${t.price}€`
        : `• ${t.name}${t.duration ? ` (${t.duration} min)` : ""} — ${t.price}€`,
    )
    .join("\n");
  const formattedDate = new Date(canonical.booking_date as string)
    .toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  return {
    canonicalId,
    bookingIds,
    bookings,
    totalPrice: totalPrice > 0 ? totalPrice : treatmentPrice,
    treatments,
    treatmentListText,
    treatmentName,
    treatmentDuration,
    treatmentPrice,
    bookingDate: formattedDate,
    bookingTime: ((canonical.booking_time as string) ?? "").substring(0, 5),
    bookingNumber: String(canonical.booking_id ?? ""),
  };
}

async function getOrCreatePaymentLink(
  supabase: SupabaseClient,
  stripe: Stripe,
  ctx: GroupContext,
  booking: Record<string, unknown>,
  _clientEmail: string,
  language: "fr" | "en",
  totalPrice: number,
  treatmentName: string,
): Promise<{ url: string; id: string; created: boolean }> {
  const existingUrl = booking.payment_link_url as string | null;
  const { data: paymentInfo } = await supabase
    .from("booking_payment_infos")
    .select("payment_link_stripe_id")
    .eq("booking_id", ctx.canonicalId)
    .maybeSingle();
  if (existingUrl) {
    return {
      url: existingUrl,
      id: paymentInfo?.payment_link_stripe_id ?? "",
      created: false,
    };
  }
  const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
  const currency = ((
    await supabase
      .from("hotels")
      .select("currency")
      .eq("id", booking.hotel_id as string)
      .maybeSingle()
  ).data as { currency?: string } | null)?.currency?.toLowerCase() || "eur";
  const groupId = booking.booking_group_id as string | null;
  const metadata: Record<string, string> = {
    booking_id: ctx.canonicalId,
    booking_number: ctx.bookingNumber,
    hotel_id: String(booking.hotel_id ?? ""),
    source: "payment_link",
  };
  if (groupId) {
    metadata.booking_group_id = groupId;
    metadata.booking_ids = JSON.stringify(ctx.bookingIds);
  }
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{
      price_data: {
        currency,
        product_data: {
          name: language === "fr"
            ? `Prestations bien-être ${brand.name}`
            : `${brand.name} Wellness Services`,
          ...(treatmentName ? { description: treatmentName } : {}),
        },
        unit_amount: Math.round(totalPrice * 100),
      },
      quantity: 1,
    }],
    metadata,
    after_completion: {
      type: "redirect",
      redirect: {
        url: `${siteUrl}/client/${booking.hotel_id}/confirmation/${ctx.canonicalId}?payment=success`,
      },
    },
  });
  return { url: paymentLink.url, id: paymentLink.id, created: true };
}

/** Returns payment link URL without sending email (admin generate mode). */
export async function ensurePaymentLinkForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  stripe?: Stripe,
  language: "fr" | "en" = "fr",
): Promise<{ paymentLinkUrl: string } | { error: string }> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_id, booking_group_id, booking_date, booking_time, total_price, hotel_id, client_email, payment_link_url, payment_status",
    )
    .eq("id", bookingId)
    .single();
  if (error || !booking) return { error: error?.message || "Booking not found" };
  if (booking.payment_status === "paid") {
    return { error: "Booking is already paid" };
  }
  const ctx = await loadGroupContext(
    supabase,
    booking as Record<string, unknown>,
  );
  const canonical = ctx.bookings.find((b) => b.id === ctx.canonicalId) ?? booking;
  let client = stripe;
  if (!client) {
    const resolved = await getStripeForVenue(supabase, booking.hotel_id);
    client = resolved.client;
  }
  const { url, id: stripePaymentLinkId, created } = await getOrCreatePaymentLink(
    supabase,
    client,
    ctx,
    canonical as Record<string, unknown>,
    booking.client_email ?? "",
    language,
    ctx.totalPrice,
    ctx.treatmentName,
  );
  await supabase
    .from("bookings")
    .update({ payment_link_url: url })
    .eq("id", ctx.canonicalId);
  if (created && stripePaymentLinkId) {
    const apptDate = new Date(
      `${canonical.booking_date}T${canonical.booking_time}`,
    );
    const expiresAt = calculateExpirationDate(apptDate, new Date());
    await supabase.from("booking_payment_infos").upsert({
      booking_id: ctx.canonicalId,
      payment_link_stripe_id: stripePaymentLinkId,
      payment_link_expires_at: expiresAt.toISOString(),
    }, { onConflict: "booking_id" });
  }
  return { paymentLinkUrl: url };
}
