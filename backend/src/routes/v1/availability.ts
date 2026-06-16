import { Hono } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { requireScope } from "../../middleware/apiKey";
import { resolveVenueIdentifier } from "./_helpers";

/**
 * Public external API (v1) — venue availability.
 *
 * Thin adapter over the `get-availability` edge function (the single source of
 * truth for slot computation). Mounted at `/v1/venues/:id/availability`.
 *
 *   GET /v1/venues/:id/availability                    → whole-venue slots
 *   GET /v1/venues/:id/availability/variants/:variantId → slots for one variant
 *
 * Both accept either:
 *   ?date=YYYY-MM-DD            → { data: { date, slots: ["09:00", …] } }
 *   ?from=YYYY-MM-DD&to=…       → { data: { from, to, days: ["2026-06-14", …] } }
 *
 * Scope: availability:read.
 */
const availability = new Hono();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

/** Drops the seconds from an "HH:MM:SS" slot → "HH:MM" for a clean public payload. */
const toHm = (slot: string): string => slot.slice(0, 5);

/** Days between two ISO dates, inclusive. NaN if either is invalid. */
function rangeDays(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.floor((b - a) / 86_400_000) + 1;
}

type Period =
  | { mode: "date"; date: string }
  | { mode: "range"; from: string; to: string }
  | { error: string };

/** Validates the date / from+to query params (mutually exclusive). */
function parsePeriod(c: { req: { query: (k: string) => string | undefined } }): Period {
  const date = c.req.query("date");
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (date) {
    if (from || to) return { error: "Use either `date` or `from`/`to`, not both" };
    if (!DATE_RE.test(date)) return { error: "Invalid `date` (expected YYYY-MM-DD)" };
    return { mode: "date", date };
  }
  if (from || to) {
    if (!from || !to) return { error: "Both `from` and `to` are required for a range" };
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return { error: "Invalid `from`/`to` (expected YYYY-MM-DD)" };
    }
    const span = rangeDays(from, to);
    if (Number.isNaN(span) || span < 1) return { error: "`to` must be on or after `from`" };
    if (span > MAX_RANGE_DAYS) return { error: `Range must not exceed ${MAX_RANGE_DAYS} days` };
    return { mode: "range", from, to };
  }
  return { error: "Provide `date` or `from`/`to`" };
}

/** Calls the get-availability edge function and shapes the `{ data }` response. */
async function respond(
  c: any,
  hotelId: string,
  period: Extract<Period, { mode: string }>,
  extra: { treatmentIds?: string[]; requestedDuration?: number } = {},
  // Identifiers echoed back at the top of `data` so the response is
  // self-describing (e.g. venue_id, variant_id, treatment_id).
  meta: Record<string, string> = {},
) {
  if (period.mode === "date") {
    const { data, error } = await supabaseAdmin.functions.invoke("get-availability", {
      body: { hotelId, date: period.date, ...extra },
    });
    if (error) {
      console.error("get-availability invoke error:", error);
      return c.json({ error: "Availability service error" }, 502);
    }
    const slots = (data?.slots ?? []).map(
      (s: { time: string; out_of_hours: boolean; available_capacity: number }) => ({
        time: toHm(s.time),
        out_of_hours: s.out_of_hours,
        available_capacity: s.available_capacity,
      }),
    );
    return c.json({ data: { ...meta, date: period.date, slots } });
  }

  const { data, error } = await supabaseAdmin.functions.invoke("get-availability", {
    body: { hotelId, startDate: period.from, endDate: period.to, ...extra },
  });
  if (error) {
    console.error("get-availability invoke error:", error);
    return c.json({ error: "Availability service error" }, 502);
  }
  return c.json({
    data: { ...meta, from: period.from, to: period.to, days: data?.daysWithSlots ?? [] },
  });
}

// GET /v1/venues/:id/availability — whole-venue availability.
availability.get("/", requireScope("availability:read"), async (c) => {
  const resolved = await resolveVenueIdentifier(c, c.req.param("id") ?? "");
  if (resolved instanceof Response) return resolved;

  const period = parsePeriod(c);
  if ("error" in period) return c.json({ error: period.error }, 400);

  return respond(c, resolved.venueId, period, {}, { venue_id: resolved.venueId });
});

// GET /v1/venues/:id/availability/variants/:variantId — for one bookable variant.
// A variant belongs to exactly one treatment, so its id is enough: we resolve
// the treatment from it, assert the treatment belongs to the venue, and use the
// variant's duration.
availability.get("/variants/:variantId", requireScope("availability:read"), async (c) => {
  const resolved = await resolveVenueIdentifier(c, c.req.param("id") ?? "");
  if (resolved instanceof Response) return resolved;

  const period = parsePeriod(c);
  if ("error" in period) return c.json({ error: period.error }, 400);

  const variantId = c.req.param("variantId") ?? "";

  // Resolve the variant + its parent treatment in one go.
  const { data: variant, error: vErr } = await supabaseAdmin
    .from("treatment_variants")
    .select("id, duration, status, treatment:treatment_menus!inner(id, hotel_id, status)")
    .eq("id", variantId)
    .maybeSingle();
  if (vErr) {
    console.error("variant lookup error:", vErr);
    return c.json({ error: "Failed to verify variant" }, 500);
  }

  // Supabase types the embedded relation as an array; normalise to a single row.
  const treatment = Array.isArray(variant?.treatment) ? variant?.treatment[0] : variant?.treatment;
  const valid =
    variant &&
    variant.status === "active" &&
    treatment &&
    treatment.hotel_id === resolved.venueId &&
    treatment.status === "active";
  if (!valid) {
    return c.json({ error: "Variant not found" }, 404);
  }

  return respond(
    c,
    resolved.venueId,
    period,
    {
      treatmentIds: [treatment.id],
      ...(variant.duration ? { requestedDuration: variant.duration } : {}),
    },
    { venue_id: resolved.venueId, treatment_id: treatment.id, variant_id: variantId },
  );
});

export default availability;
