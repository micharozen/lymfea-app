/**
 * Writing a booking's treatment lines, shared by the two client-flow creators:
 * create-client-booking (room/cash/offert/gift) and confirmSetupIntent (card).
 *
 * An add-on is a supplement hanging off a base soin, not a guest's soin. It must
 * be stored as such (`is_addon`) and pointed at the soin it extends
 * (`parent_booking_treatment_id`), because that parent link is what defines the
 * LEG a therapist claims in accept_booking: one base soin + its add-ons.
 *
 * Two consequences the callers get for free:
 *  - a duo with an add-on is still a duo (add-ons are not counted as guest soins);
 *  - the slot lasts as long as the longest leg, not the longest single soin.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface TreatmentLine {
  treatmentId: string;
  variantId?: string | null;
  quantity?: number;
  /** For an add-on: the treatmentId of the soin it extends. */
  parentTreatmentId?: string | null;
}

/**
 * Which of these treatments are add-ons? Mirrors get_public_treatments: the
 * treatment's own flag OR its category's. Categories are matched by name within
 * the venue. Never derive this from client input.
 */
export async function fetchAddonTreatmentIds(
  supabase: SupabaseClient,
  hotelId: string,
  treatments: Array<{ id: string; is_addon?: boolean | null; category?: string | null }>,
): Promise<Set<string>> {
  const { data: addonCategories } = await supabase
    .from("treatment_categories")
    .select("name")
    .eq("hotel_id", hotelId)
    .eq("is_addon", true);

  const addonCategoryNames = new Set((addonCategories || []).map((c: { name: string }) => c.name));
  return new Set(
    treatments
      .filter((t) => t.is_addon || (t.category != null && addonCategoryNames.has(t.category)))
      .map((t) => t.id),
  );
}

const qtyOf = (line: TreatmentLine) => Math.max(1, Number(line.quantity) || 1);

/**
 * Slot duration in minutes.
 *  - Solo: everything runs sequentially → sum (× quantity).
 *  - Duo: one leg per guest, legs run in parallel → the longest leg wins. An
 *    add-on extends its parent's leg; an orphan add-on (parent removed from the
 *    cart) is added on top, since whoever claims it performs it after their soin.
 */
export function computeSlotDuration(
  lines: TreatmentLine[],
  isDuo: boolean,
  /** Unit duration of one line — callers resolve the variant's duration when there is one. */
  durationOfLine: (line: TreatmentLine) => number,
  isAddon: (treatmentId: string) => boolean,
): number {
  if (!isDuo) {
    return lines.reduce((sum, line) => sum + durationOfLine(line) * qtyOf(line), 0);
  }

  const legDurations = new Map<string, number>();
  for (const line of lines) {
    if (!isAddon(line.treatmentId)) legDurations.set(line.treatmentId, durationOfLine(line));
  }

  let orphanDuration = 0;
  for (const line of lines) {
    if (!isAddon(line.treatmentId)) continue;
    const minutes = durationOfLine(line) * qtyOf(line);
    const parentId = line.parentTreatmentId;
    if (parentId && legDurations.has(parentId)) {
      legDurations.set(parentId, legDurations.get(parentId)! + minutes);
    } else {
      orphanDuration += minutes;
    }
  }

  return Math.max(0, ...legDurations.values()) + orphanDuration;
}

/**
 * Insert the lines in two passes — base soins first, so each add-on can point at
 * the row of the soin it extends. Returns an error, or null on success.
 */
export async function insertBookingTreatmentLines(
  supabase: SupabaseClient,
  bookingId: string,
  lines: TreatmentLine[],
  isAddon: (treatmentId: string) => boolean,
): Promise<unknown | null> {
  const expand = (line: TreatmentLine, extra: Record<string, unknown> = {}) =>
    Array.from({ length: qtyOf(line) }, () => ({
      booking_id: bookingId,
      treatment_id: line.treatmentId,
      variant_id: line.variantId ?? null,
      ...extra,
    }));

  const baseLines = lines.filter((l) => !isAddon(l.treatmentId));
  const addonLines = lines.filter((l) => isAddon(l.treatmentId));

  const { data: baseRows, error: baseError } = await supabase
    .from("booking_treatments")
    .insert(baseLines.flatMap((l) => expand(l)))
    .select("id, treatment_id");
  if (baseError) return baseError;
  if (addonLines.length === 0) return null;

  // Several base rows can share a treatment_id (quantity > 1). The add-on hangs
  // off the first of them — they are interchangeable, one leg each.
  const parentRowByTreatment = new Map<string, string>();
  for (const row of (baseRows || []) as Array<{ id: string; treatment_id: string }>) {
    if (!parentRowByTreatment.has(row.treatment_id)) parentRowByTreatment.set(row.treatment_id, row.id);
  }

  const addonRows = addonLines.flatMap((l) =>
    expand(l, {
      is_addon: true,
      parent_booking_treatment_id: l.parentTreatmentId
        ? parentRowByTreatment.get(l.parentTreatmentId) ?? null
        : null,
    })
  );

  const { error: addonError } = await supabase.from("booking_treatments").insert(addonRows);
  return addonError ?? null;
}
