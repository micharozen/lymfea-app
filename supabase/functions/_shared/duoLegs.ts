/**
 * Positional allocation of a duo booking's treatments to its therapists.
 * Mirror of src/lib/duoLegs.ts so the server stays the source of truth.
 *
 * No DB column links a treatment to a specific therapist, so the mapping is
 * positional (same rule the admin recap table uses):
 *  - Combo-duo (`treatments.length === guestCount`): therapist[i] performs
 *    `treatments[i]` → paid on `treatments[i].duration`.
 *  - Shared-duo (otherwise, usually a single treatment done in parallel): every
 *    therapist performs `treatments[0]` → paid on `treatments[0].duration`.
 *
 * Therapists must be passed in a stable order (e.g. `booking_therapists` sorted
 * by `assigned_at`) so index i is consistent across surfaces.
 */

export interface DuoLegTreatment {
  duration: number | null;
}

export interface DuoLeg {
  therapistId: string;
  /** Duration (minutes) of the treatment this therapist performs. */
  duration: number;
  /** Index into the therapists array (position in the duo). */
  index: number;
}

export function computeDuoLegs(
  therapistIds: string[],
  treatments: DuoLegTreatment[],
  guestCount: number,
): DuoLeg[] {
  if (therapistIds.length === 0) return [];
  const perTreatment = treatments.length === guestCount && guestCount > 0;

  return therapistIds.map((therapistId, index) => {
    const t = perTreatment ? treatments[index] : treatments[0];
    return {
      therapistId,
      duration: t?.duration ?? 0,
      index,
    };
  });
}
