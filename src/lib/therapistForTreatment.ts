/**
 * Stable soin↔therapist link (booking_treatments.therapist_id).
 * Combo-duo (N soins = N invités) → therapist[i] performs treatment[i].
 * Solo (guest_count ≤ 1) → the single therapist performs every line.
 * Shared-duo (1 soin, N thérapeutes) or broadcast (no therapist) → NULL
 * (booking_therapists roster is the source there).
 *
 * `allTherapistIds` must be ordered to match the treatments (same positional
 * convention used at booking creation and edit).
 */
export function therapistForTreatment(
  index: number,
  treatmentCount: number,
  guestCount: number,
  allTherapistIds: string[],
): string | null {
  if (allTherapistIds.length === 0) return null;
  const perTreatment = treatmentCount === guestCount && guestCount > 0;
  if (perTreatment) return allTherapistIds[index] ?? null;
  if (guestCount <= 1) return allTherapistIds[0] ?? null;
  return null;
}

/**
 * Add-on aware per-line therapist resolution for a whole booking.
 *
 * Unlike therapistForTreatment (which counts every line), this treats add-ons as
 * supplements that hang off a base soin, so a duo carrying add-ons is still a
 * combo-duo. Convention mirrors booking creation (buildComboDuoBookingParams +
 * insertSingleBooking):
 *  - solo (guestCount ≤ 1) → the single therapist performs every line.
 *  - combo-duo (base soin count === guestCount) → base soins take slots 0..n-1
 *    in order; each add-on inherits its person round-robin (add-on order % n).
 *  - shared-duo (base count ≠ guestCount) → NULL (booking_therapists roster is
 *    the source there).
 *
 * `therapistIdsByLeg[i]` is the therapist for person i (same order as the duo
 * picker slots).
 */
export function resolveLineTherapistIds(
  lines: ReadonlyArray<{ isAddon?: boolean | null }>,
  guestCount: number,
  therapistIdsByLeg: ReadonlyArray<string>,
): (string | null)[] {
  if (therapistIdsByLeg.length === 0) return lines.map(() => null);
  if (guestCount <= 1) {
    const solo = therapistIdsByLeg[0] ?? null;
    return lines.map(() => solo);
  }
  const baseCount = lines.reduce((n, l) => n + (l.isAddon ? 0 : 1), 0);
  if (baseCount !== guestCount) return lines.map(() => null);
  let baseLeg = 0;
  let addonSeq = 0;
  return lines.map((l) => {
    const leg = l.isAddon ? addonSeq++ % guestCount : baseLeg++;
    return therapistIdsByLeg[leg] ?? null;
  });
}
