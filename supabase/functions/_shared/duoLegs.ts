/**
 * Positional allocation of a duo booking's treatments to its therapists.
 * Mirror of src/lib/duoLegs.ts so the server stays the source of truth.
 *
 * Add-ons are supplements hanging off a base soin, never a guest's soin: they
 * are filtered out before the split, otherwise a duo with an add-on would count
 * more treatments than guests and be misread as a shared-duo. Their duration is
 * attributed via the stable link (see therapistLegDuration.ts), not positionally.
 *
 * On the remaining base soins the mapping is positional (same rule the admin
 * recap table uses):
 *  - Combo-duo (`bases.length === guestCount`): therapist[i] performs
 *    `bases[i]` → paid on `bases[i].duration`.
 *  - Shared-duo (otherwise, usually a single treatment done in parallel): every
 *    therapist performs `bases[0]` → paid on `bases[0].duration`.
 *
 * Therapists must be passed in a stable order (e.g. `booking_therapists` sorted
 * by `assigned_at`) so index i is consistent across surfaces.
 */

export interface DuoLegTreatment {
  duration: number | null;
  is_addon?: boolean | null;
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
  const bases = treatments.filter((t) => !t.is_addon);
  const perTreatment = bases.length === guestCount && guestCount > 0;

  return therapistIds.map((therapistId, index) => {
    const t = perTreatment ? bases[index] : bases[0];
    return {
      therapistId,
      duration: t?.duration ?? 0,
      index,
    };
  });
}
