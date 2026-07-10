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

// Cadence — two sends, never more. The second only exists to catch a slot that
// is about to arrive; a guest who abandoned a booking three weeks out is not
// chased twice.
const R1_AFTER_HOURS = 1;
const R2_AFTER_R1_HOURS = 6;
/** R2 only fires once the requested slot has entered this window. */
const R2_SLOT_WITHIN_HOURS = 24;
/** …and never in the last hours before it: too late to be useful, only annoying. */
const R2_MIN_LEAD_HOURS = 3;
const MAX_REMINDERS = 2;
const MAX_AGE_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;

interface CartSnapshotItem {
  treatmentId?: string;
  variantId?: string | null;
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
 * Cron-only. Chases abandoned checkout intents with at most two emails: one an
 * hour after the guest left the flow, a second only when the slot they had
 * picked is about to come up. Skipped when the slot has passed, when the intent
 * is stale (backlog after an outage), when the customer has booked at that venue
 * since, or when the recipient asked not to be reminded again.
 */
serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const now = new Date();
    const remindBefore = new Date(now.getTime() - R1_AFTER_HOURS * HOUR_MS);
    const oldestAllowed = new Date(now.getTime() - MAX_AGE_DAYS * 24 * HOUR_MS);
    // Coarse SQL pre-filter: a slot dated yesterday can still be in the future in a
    // venue timezone behind UTC. The exact check happens per intent, below.
    const earliestDate = new Date(now.getTime() - 24 * HOUR_MS).toISOString().slice(0, 10);

    const { data: intents, error: fetchError } = await supabase
      .from("checkout_intents")
      .select(
        "id, customer_id, hotel_id, client_email, client_first_name, language, booking_date, booking_time, cart_snapshot, resume_token, created_at, reminder_count, reminder_sent_at, hotels ( name, slug, timezone, image, address, postal_code, city, country, contact_email, website_url, client_cancellation_cutoff_hours )",
      )
      .is("converted_at", null)
      .lt("reminder_count", MAX_REMINDERS)
      .lt("created_at", remindBefore.toISOString())
      .gt("created_at", oldestAllowed.toISOString())
      .or(`booking_date.is.null,booking_date.gte.${earliestDate}`)
      .order("created_at", { ascending: true });

    if (fetchError) throw fetchError;

    const skipped = {
      slot_past: 0,
      not_due: 0,
      opted_out: 0,
      already_booked: 0,
      empty_cart: 0,
      no_venue: 0,
      no_token: 0,
      email_failed: 0,
      mark_failed: 0,
    };

    if (!intents || intents.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped }), { status: 200 });
    }

    const bookedSince = await fetchBookedSince(supabase, intents, oldestAllowed);
    const optedOut = await fetchOptedOut(supabase, intents);
    const durations = await fetchDurations(supabase, intents);
    const appUrl = Deno.env.get("PUBLIC_APP_URL") ?? `https://${brand.appDomain}`;

    let sent = 0;

    for (const intent of intents) {
      const venue = Array.isArray(intent.hotels) ? intent.hotels[0] : intent.hotels;
      if (!venue?.slug || !intent.client_email) {
        skipped.no_venue++;
        continue;
      }

      // The guest asked to stop being reminded. Transactional emails are unaffected.
      if (optedOut.has(intent.client_email.trim().toLowerCase())) {
        skipped.opted_out++;
        continue;
      }

      // The slot the guest had picked is stored as venue-local wall-clock: resolve
      // it against the venue timezone before deciding anything about it.
      const slot = resolveSlot(intent.booking_date, intent.booking_time, venue.timezone);
      if (slot && slot <= now) {
        skipped.slot_past++;
        continue;
      }

      if (!isDue(intent, slot, now)) {
        skipped.not_due++;
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
          variantLabel: item.variantLabel ?? null,
          // The snapshot never stored durations — resolve them from the catalog,
          // variant first, so every line shows one.
          duration: (item.variantId ? durations.get(item.variantId) : undefined) ??
            (item.treatmentId ? durations.get(item.treatmentId) : undefined) ?? null,
        }));

      if (items.length === 0) {
        skipped.empty_cart++;
        continue;
      }

      // RGPD: no reminder leaves without a working way to stop the next one.
      const { data: optOutToken, error: tokenError } = await supabase.rpc(
        "issue_email_opt_out_token",
        { _email: intent.client_email, _source: "checkout_intent_reminder" },
      );
      if (tokenError || !optOutToken) {
        console.error(
          `[CHECKOUT-REMINDER] ❌ No opt-out token for intent ${intent.id}:`,
          tokenError?.message,
        );
        skipped.no_token++;
        continue;
      }

      const lang: "fr" | "en" = intent.language === "en" ? "en" : "fr";
      const resumeUrl = `${appUrl}/client/${venue.slug}/resume?token=${intent.resume_token}`;
      // `resume` lets the opt-out page offer a last "stay, actually" way back in.
      const unsubscribeUrl =
        `${appUrl}/unsubscribe?token=${optOutToken}&resume=${encodeURIComponent(resumeUrl)}`;
      const oneClickUrl =
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe-email?token=${optOutToken}`;

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
          bookingTime: intent.booking_time,
          slotIsSoon: slot !== null &&
            slot.getTime() - now.getTime() <= R2_SLOT_WITHIN_HOURS * HOUR_MS,
          cancellationCutoffHours: venue.client_cancellation_cutoff_hours,
          resumeUrl,
          rescheduleUrl: `${resumeUrl}&step=schedule`,
          unsubscribeUrl,
        }),
        // One-click unsubscribe: Gmail and Yahoo require it on bulk mail. The POST
        // lands on the `unsubscribe-email` edge function, never on the React page —
        // a 200 from the SPA would look like success while recording nothing.
        headers: {
          "List-Unsubscribe": `<${oneClickUrl}>, <${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        audit: {
          tableName: "checkout_intents",
          recordId: intent.id,
          emailType: "checkout_intent_reminder",
          metadata: { reminder_number: intent.reminder_count + 1 },
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

      console.log(
        `[CHECKOUT-REMINDER] ✅ Reminder ${intent.reminder_count + 1}/${MAX_REMINDERS} sent to ${intent.client_email} for intent ${intent.id}`,
      );
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent, skipped }), { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CHECKOUT-REMINDER] Global error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

/** The requested slot as an instant, resolved in the venue's timezone. */
function resolveSlot(
  bookingDate: string | null,
  bookingTime: string | null,
  timezone: string | null,
): Date | null {
  if (!bookingDate || !bookingTime) return null;
  return venueLocalToUtc(bookingDate, bookingTime, timezone ?? "UTC");
}

/**
 * Whether this intent is due for its next reminder.
 *
 * R1 — an hour after the abandon; the SQL pre-filter already guarantees it.
 * R2 — six hours after R1, and only for a slot that has entered the next 24 h
 * while still being at least R2_MIN_LEAD_HOURS away. An intent with no slot, or
 * with a distant one, is therefore reminded exactly once.
 */
function isDue(
  intent: { reminder_count: number; reminder_sent_at: string | null },
  slot: Date | null,
  now: Date,
): boolean {
  if (intent.reminder_count === 0) return true;
  if (!slot || !intent.reminder_sent_at) return false;

  const sinceLast = now.getTime() - new Date(intent.reminder_sent_at).getTime();
  if (sinceLast < R2_AFTER_R1_HOURS * HOUR_MS) return false;

  const untilSlot = slot.getTime() - now.getTime();
  return untilSlot <= R2_SLOT_WITHIN_HOURS * HOUR_MS && untilSlot >= R2_MIN_LEAD_HOURS * HOUR_MS;
}

/** Lower-cased recipient addresses that asked to stop receiving reminders. */
async function fetchOptedOut(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  intents: Array<{ client_email: string | null }>,
): Promise<Set<string>> {
  const emails = [
    ...new Set(
      intents
        .map((intent) => intent.client_email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  if (emails.length === 0) return new Set();

  const { data, error } = await supabase
    .from("email_opt_outs")
    .select("email")
    .in("email", emails)
    .not("opted_out_at", "is", null);

  // Failing open here would mail the very people who opted out: abort the run.
  if (error) {
    console.error("[CHECKOUT-REMINDER] Failed to load opt-outs:", error.message);
    throw error;
  }
  return new Set((data ?? []).map((row: { email: string }) => row.email));
}

/**
 * Minutes per treatment id AND per variant id in one map — both are UUIDs, from
 * two tables, and never collide. The cart snapshot stores no duration, so the
 * catalog is the only source; a line whose treatment vanished shows no duration
 * rather than a stale one.
 */
async function fetchDurations(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  intents: Array<{ cart_snapshot: unknown }>,
): Promise<Map<string, number>> {
  const treatmentIds = new Set<string>();
  const variantIds = new Set<string>();

  for (const intent of intents) {
    for (const item of ((intent.cart_snapshot ?? {}) as CartSnapshot).items ?? []) {
      if (item.treatmentId) treatmentIds.add(item.treatmentId);
      if (item.variantId) variantIds.add(item.variantId);
    }
  }

  const durations = new Map<string, number>();

  const load = async (table: string, ids: Set<string>) => {
    if (ids.size === 0) return;
    const { data, error } = await supabase.from(table).select("id, duration").in("id", [...ids]);
    if (error) {
      console.error(`[CHECKOUT-REMINDER] Failed to load ${table} durations:`, error.message);
      return;
    }
    for (const row of (data ?? []) as Array<{ id: string; duration: number | null }>) {
      if (row.duration) durations.set(row.id, row.duration);
    }
  };

  await Promise.all([
    load("treatments", treatmentIds),
    load("treatment_variants", variantIds),
  ]);

  return durations;
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
