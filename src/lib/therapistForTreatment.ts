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
