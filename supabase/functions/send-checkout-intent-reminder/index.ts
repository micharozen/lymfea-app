import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { venueLocalToUtc } from "../_shared/venue-time.ts";
import {
  CheckoutIntentReminderItem,
  getCheckoutIntentReminderHtml,
  getCheckoutIntentReminderSubject,
} from "../_shared/templates/checkout-intent-reminder.ts";

const REMIND_AFTER_HOURS = 1;
const MAX_AGE_DAYS = 7;

interface CartSnapshotItem {
  name?: string;
  quantity?: number;
  price?: number | null;
  isPriceOnRequest?: boolean;
  variantLabel?: string | null;
}

interface CartSnapshot {
  items?: CartSnapshotItem[];
  total?: number | null;
  currency?: string;
}

/**
 * Cron-only. Sends a single reminder email for each abandoned checkout intent,
 * one hour after the guest left the flow. Skipped when the requested slot has
 * passed, when the intent is stale (backlog after an outage), or when the
 * customer has booked at that venue since.
 */
serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const now = new Date();
    const remindBefore = new Date(now.getTime() - REMIND_AFTER_HOURS * 60 * 60 * 1000);
    const oldestAllowed = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    // Coarse SQL pre-filter: a slot dated yesterday can still be in the future in a
    // venue timezone behind UTC. The exact check happens per intent, below.
    const earliestDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: intents, error: fetchError } = await supabase
      .from("checkout_intents")
      .select(
        "id, customer_id, hotel_id, client_email, client_first_name, language, booking_date, booking_time, cart_snapshot, resume_token, created_at, hotels ( name, slug, timezone, image, address, postal_code, city, country, contact_email, website_url )",
      )
      .is("converted_at", null)
      .eq("reminder_count", 0)
      .lt("created_at", remindBefore.toISOString())
      .gt("created_at", oldestAllowed.toISOString())
      .or(`booking_date.is.null,booking_date.gte.${earliestDate}`)
      .order("created_at", { ascending: true });

    if (fetchError) throw fetchError;

    const skipped = {
      slot_past: 0,
      already_booked: 0,
      empty_cart: 0,
      no_venue: 0,
      email_failed: 0,
      mark_failed: 0,
    };

    if (!intents || intents.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped }), { status: 200 });
    }

    const bookedSince = await fetchBookedSince(supabase, intents, oldestAllowed);
    const appUrl = Deno.env.get("PUBLIC_APP_URL") ?? `https://${brand.appDomain}`;

    let sent = 0;

    for (const intent of intents) {
      const venue = Array.isArray(intent.hotels) ? intent.hotels[0] : intent.hotels;
      if (!venue?.slug || !intent.client_email) {
        skipped.no_venue++;
        continue;
      }

      // The slot the guest had picked is stored as venue-local wall-clock: resolve
      // it against the venue timezone before deciding it has passed.
      if (isSlotPast(intent.booking_date, intent.booking_time, venue.timezone, now)) {
        skipped.slot_past++;
        continue;
      }

      // The customer booked at this venue after abandoning — nothing to chase.
      if (bookedSince.has(`${intent.customer_id}:${intent.hotel_id}`)) {
        skipped.already_booked++;
        continue;
      }

      const snapshot = (intent.cart_snapshot ?? {}) as CartSnapshot;
      const items: CheckoutIntentReminderItem[] = (snapshot.items ?? [])
        .filter((item) => typeof item?.name === "string")
        .map((item) => ({
          name: item.name!,
          quantity: item.quantity ?? 1,
          price: item.isPriceOnRequest ? null : (item.price ?? null),
          meta: item.variantLabel ?? null,
        }));

      if (items.length === 0) {
        skipped.empty_cart++;
        continue;
      }

      const lang: "fr" | "en" = intent.language === "en" ? "en" : "fr";

      const emailResult = await sendEmail({
        to: intent.client_email,
        subject: getCheckoutIntentReminderSubject(lang, venue.name),
        html: getCheckoutIntentReminderHtml({
          lang,
          firstName: intent.client_first_name,
          venueName: venue.name,
          venue,
          items,
          total: typeof snapshot.total === "number" ? snapshot.total : null,
          currency: snapshot.currency ?? "EUR",
          bookingDate: intent.booking_date,
          resumeUrl: `${appUrl}/client/${venue.slug}/resume?token=${intent.resume_token}`,
        }),
        audit: {
          tableName: "checkout_intents",
          recordId: intent.id,
          emailType: "checkout_intent_reminder",
        },
      });

      if (emailResult.error) {
        console.error(`[CHECKOUT-REMINDER] ❌ Email error for intent ${intent.id}:`, emailResult.error);
        skipped.email_failed++;
        continue;
      }

      const { error: markError } = await supabase.rpc("mark_checkout_intent_reminded", {
        _intent_id: intent.id,
      });
      if (markError) {
        console.error(`[CHECKOUT-REMINDER] ❌ Failed to mark intent ${intent.id}:`, markError.message);
        skipped.mark_failed++;
        continue;
      }

      console.log(`[CHECKOUT-REMINDER] ✅ Sent to ${intent.client_email} for intent ${intent.id}`);
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent, skipped }), { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CHECKOUT-REMINDER] Global error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

/**
 * True when the guest's requested slot lies in the past, resolved in the venue's
 * timezone. Intents with no slot (cart abandoned before scheduling) never expire.
 */
function isSlotPast(
  bookingDate: string | null,
  bookingTime: string | null,
  timezone: string | null,
  now: Date,
): boolean {
  if (!bookingDate || !bookingTime) return false;
  const slot = venueLocalToUtc(bookingDate, bookingTime, timezone ?? "UTC");
  return slot !== null && slot <= now;
}

/**
 * `customer_id:hotel_id` pairs that already have a booking created after the
 * oldest candidate intent. One grouped query rather than one per intent; the
 * per-intent `created_at` comparison happens in the caller's filter above,
 * which is safe because every candidate is at most MAX_AGE_DAYS old.
 */
async function fetchBookedSince(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  intents: Array<{ customer_id: string; hotel_id: string; created_at: string }>,
  oldestAllowed: Date,
): Promise<Set<string>> {
  const customerIds = [...new Set(intents.map((i) => i.customer_id))];
  const hotelIds = [...new Set(intents.map((i) => i.hotel_id))];

  const { data, error } = await supabase
    .from("bookings")
    .select("customer_id, hotel_id, created_at")
    .in("customer_id", customerIds)
    .in("hotel_id", hotelIds)
    .gt("created_at", oldestAllowed.toISOString());

  if (error) {
    console.error("[CHECKOUT-REMINDER] Failed to load recent bookings:", error.message);
    return new Set();
  }

  const booked = new Set<string>();
  for (const intent of intents) {
    const hasLaterBooking = (data ?? []).some(
      (b: { customer_id: string; hotel_id: string; created_at: string }) =>
        b.customer_id === intent.customer_id &&
        b.hotel_id === intent.hotel_id &&
        new Date(b.created_at) > new Date(intent.created_at),
    );
    if (hasLaterBooking) booked.add(`${intent.customer_id}:${intent.hotel_id}`);
  }
  return booked;
}
