import { Hono } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { requireScope } from "../../middleware/apiKey";
import { UUID_RE, resolveVenueIdentifier } from "./_helpers";

/**
 * Public external API (v1) — create a booking on behalf of a guest.
 *
 *   POST /v1/venues/:id/bookings   (scope: bookings:write)
 *
 * Used by third-party tools (Staycation, ClassPass, …) that have already read
 * the menu (`/treatments`) and availability (`/availability`) and collected the
 * guest's payment on their side. We trust the partner's `price_paid` (their
 * price may differ from ours) and create the booking as `pending` — it is not
 * confirmed until a therapist accepts the broadcast (async, out of MVP scope).
 *
 * Reuses the same server-side chain as the client flow:
 *   find_or_create_customer → reserve_trunk_atomically → booking_treatments
 *   → dispatch-booking-therapist / notify-admin-new-booking.
 */
const bookings = new Hono();

const NAME_RE = /^[a-zA-ZÀ-ÿ\s\-']+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{6,20}$/;
// client_type is constrained by a CHECK on the bookings table.
const KNOWN_CLIENT_TYPES = new Set(["hotel", "staycation", "classpass", "external"]);

interface ParsedBody {
  variantId: string;
  startAt: Date;
  guestCount: number;
  guest: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    language: string;
  };
  notes: string | null;
  externalReference: string | null;
  externalId: string | null;
  priceAmount: number;
  priceCurrency: string;
}

/** Manual body validation (the backend doesn't use zod — see availability.ts). */
function parseBody(raw: unknown): ParsedBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid JSON body" };
  const b = raw as Record<string, unknown>;

  if (typeof b.variant_id !== "string" || !UUID_RE.test(b.variant_id)) {
    return { error: "`variant_id` must be a valid UUID" };
  }
  const variantId = b.variant_id;

  const startRaw = b.start_at;
  if (typeof startRaw !== "string") return { error: "`start_at` is required" };
  const startMs = Date.parse(startRaw);
  if (Number.isNaN(startMs)) return { error: "`start_at` must be an ISO 8601 datetime" };
  const startAt = new Date(startMs);
  if (startMs <= Date.now()) return { error: "`start_at` must be in the future" };

  const guestCount = b.guest_count === undefined ? 1 : b.guest_count;
  if (typeof guestCount !== "number" || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return { error: "`guest_count` must be an integer between 1 and 20" };
  }

  const g = b.guest as Record<string, unknown> | null | undefined;
  if (!g || typeof g !== "object") return { error: "`guest` is required" };
  const firstName = g.first_name;
  if (typeof firstName !== "string" || !NAME_RE.test(firstName) || firstName.length > 100) {
    return { error: "`guest.first_name` is required and must contain only letters" };
  }
  const lastName = g.last_name;
  if (typeof lastName !== "string" || !NAME_RE.test(lastName) || lastName.length > 100) {
    return { error: "`guest.last_name` is required and must contain only letters" };
  }
  const phone = g.phone;
  if (typeof phone !== "string" || !PHONE_RE.test(phone)) {
    return { error: "`guest.phone` is required (E.164, e.g. +33612345678)" };
  }
  let email: string | null = null;
  if (g.email != null && g.email !== "") {
    if (typeof g.email !== "string" || !EMAIL_RE.test(g.email) || g.email.length > 255) {
      return { error: "`guest.email` is invalid" };
    }
    email = g.email;
  }
  const language = g.language === "en" ? "en" : "fr";

  const notes = b.notes == null ? null : b.notes;
  if (notes !== null && (typeof notes !== "string" || notes.length > 500)) {
    return { error: "`notes` must be a string of at most 500 characters" };
  }
  const externalReference = b.external_reference == null ? null : b.external_reference;
  if (externalReference !== null && (typeof externalReference !== "string" || externalReference.length > 255)) {
    return { error: "`external_reference` must be a string of at most 255 characters" };
  }
  const externalId = b.external_id == null ? null : b.external_id;
  if (externalId !== null && (typeof externalId !== "string" || externalId.length > 255)) {
    return { error: "`external_id` must be a string of at most 255 characters" };
  }

  const p = b.price_paid as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object") return { error: "`price_paid` is required" };
  const amount = p.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return { error: "`price_paid.amount` must be a positive number (major units, e.g. 120.00)" };
  }
  const currency = p.currency;
  if (typeof currency !== "string" || currency.length !== 3) {
    return { error: "`price_paid.currency` must be a 3-letter ISO code" };
  }

  return {
    variantId,
    startAt,
    guestCount,
    guest: { firstName, lastName, email, phone, language },
    notes,
    externalReference,
    externalId,
    priceAmount: amount,
    priceCurrency: currency.toUpperCase(),
  };
}

/** Converts a UTC instant to the venue-local booking_date / booking_time. */
function toVenueLocal(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/** Derives client_type from the "source.XXXX" external_reference prefix. */
function clientTypeFrom(externalReference: string | null): string {
  const prefix = externalReference?.split(".")[0]?.toLowerCase();
  return prefix && KNOWN_CLIENT_TYPES.has(prefix) ? prefix : "external";
}

/** Shapes the public booking response from a stored row + request echo. */
function shape(row: Record<string, unknown>, body: ParsedBody, currency: string) {
  return {
    id: row.id,
    booking_number: row.booking_id,
    status: row.status,
    start_at: body.startAt.toISOString(),
    variant_id: body.variantId,
    guest_count: row.guest_count,
    external_reference: row.external_reference,
    external_id: row.external_id,
    total_price: { amount: row.total_price, currency },
  };
}

bookings.post("/", requireScope("bookings:write"), async (c) => {
  const resolved = await resolveVenueIdentifier(c, c.req.param("id") ?? "");
  if (resolved instanceof Response) return resolved;
  const hotelId = resolved.venueId;

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseBody(rawBody);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  // Venue metadata (timezone for slot conversion, currency for validation).
  const { data: hotel, error: hotelErr } = await supabaseAdmin
    .from("hotels")
    .select("name, currency, timezone")
    .eq("id", hotelId)
    .single();
  if (hotelErr || !hotel) {
    console.error("hotel lookup error:", hotelErr);
    return c.json({ error: "Failed to load venue" }, 500);
  }
  const currency = (hotel.currency ?? "EUR").toUpperCase();
  const timeZone = hotel.timezone ?? "Europe/Paris";

  if (parsed.priceCurrency !== currency) {
    return c.json({ error: `price_paid.currency must match the venue currency (${currency})` }, 422);
  }

  // Resolve variant + its parent treatment; assert it belongs to this venue.
  const { data: variant, error: vErr } = await supabaseAdmin
    .from("treatment_variants")
    .select("id, duration, status, treatment:treatment_menus!inner(id, hotel_id, status, duration)")
    .eq("id", parsed.variantId)
    .maybeSingle();
  if (vErr) {
    console.error("variant lookup error:", vErr);
    return c.json({ error: "Failed to verify variant" }, 500);
  }
  const treatment = Array.isArray(variant?.treatment) ? variant?.treatment[0] : variant?.treatment;
  const variantValid =
    variant &&
    variant.status === "active" &&
    treatment &&
    treatment.hotel_id === hotelId &&
    treatment.status === "active";
  if (!variantValid) {
    return c.json({ error: "Variant not found" }, 404);
  }
  const treatmentId: string = treatment.id;
  const duration: number | null = variant.duration ?? treatment.duration ?? null;

  // Idempotency: a replayed POST (same external_id) returns the existing booking.
  if (parsed.externalId) {
    const { data: existing } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_id, status, guest_count, total_price, external_reference, external_id")
      .eq("hotel_id", hotelId)
      .eq("external_id", parsed.externalId)
      .maybeSingle();
    if (existing) return c.json({ data: shape(existing, parsed, currency) }, 200);
  }

  const { date: bookingDate, time: bookingTime } = toVenueLocal(parsed.startAt, timeZone);

  const { data: customerId } = await supabaseAdmin.rpc("find_or_create_customer", {
    _phone: parsed.guest.phone,
    _first_name: parsed.guest.firstName,
    _last_name: parsed.guest.lastName,
    _email: parsed.guest.email,
  });

  // Atomic room/therapist reservation — inserts the booking row.
  const { data: newBookingId, error: rpcError } = await supabaseAdmin.rpc("reserve_trunk_atomically", {
    _hotel_id: hotelId,
    _booking_date: bookingDate,
    _booking_time: bookingTime,
    _duration: duration && duration > 0 ? duration : null,
    _hotel_name: hotel.name,
    _client_first_name: parsed.guest.firstName,
    _client_last_name: parsed.guest.lastName,
    _client_email: parsed.guest.email,
    _phone: parsed.guest.phone,
    _room_number: null,
    _client_note: parsed.notes,
    _status: "pending",
    _payment_method: "partner_billed",
    _payment_status: "paid",
    _total_price: parsed.priceAmount,
    _language: parsed.guest.language,
    _treatment_ids: [treatmentId],
    _customer_id: customerId ?? null,
    _therapist_gender: null,
    _guest_count: parsed.guestCount,
  });

  if (rpcError) {
    if (rpcError.message?.includes("NO_ROOM_AVAILABLE")) {
      return c.json({ error: "slot_unavailable" }, 409);
    }
    console.error("reserve_trunk_atomically error:", rpcError);
    return c.json({ error: "Failed to create booking" }, 500);
  }
  const bookingId = newBookingId as string;

  // Override the partner-specific fields the RPC doesn't handle.
  // `source = 'api'` is the value reserved for the external API (bookings_source_check).
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("bookings")
    .update({
      client_type: clientTypeFrom(parsed.externalReference),
      source: "api",
      external_reference: parsed.externalReference,
      external_id: parsed.externalId,
    })
    .eq("id", bookingId)
    .select("id, booking_id, status, guest_count, total_price, external_reference, external_id")
    .single();

  if (updErr) {
    // Unique violation on (hotel_id, external_id) → concurrent duplicate.
    // The RPC already created a pending row holding a room; drop it so the
    // duplicate request doesn't leave an orphan booking blocking the slot.
    if (updErr.code === "23505") {
      await supabaseAdmin.from("bookings").delete().eq("id", bookingId);
      return c.json({ error: "duplicate_external_id" }, 409);
    }
    console.error("booking override update error:", updErr);
    return c.json({ error: "Failed to finalize booking" }, 500);
  }

  // One treatment line for the booked variant.
  const { error: btErr } = await supabaseAdmin
    .from("booking_treatments")
    .insert({ booking_id: bookingId, treatment_id: treatmentId, variant_id: parsed.variantId });
  if (btErr) console.error("booking_treatments insert error:", btErr);

  // Notify therapists (broadcast) + admin — best-effort, mirrors the client flow.
  try {
    await supabaseAdmin.functions.invoke("dispatch-booking-therapist", { body: { bookingId } });
  } catch (err) {
    console.error("dispatch-booking-therapist error:", err);
  }
  try {
    await supabaseAdmin.functions.invoke("notify-admin-new-booking", { body: { bookingId } });
  } catch (err) {
    console.error("notify-admin-new-booking error:", err);
  }

  return c.json({ data: shape(updated, parsed, currency) }, 201);
});

export default bookings;
