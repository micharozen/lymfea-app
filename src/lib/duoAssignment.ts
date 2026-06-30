/**
 * Duo leg assignment — "longest first" rule.
 *
 * A combo-duo booking holds N treatment "legs" performed in parallel by N
 * therapists. We deterministically pair each leg to a therapist so the first
 * therapist takes the longest soin, the second the next longest, and so on.
 *
 * This module is pure (no IO) and shared by the create/edit write paths and the
 * admin recap display. The broadcast-accept path applies the same rule in SQL
 * (accept_booking RPC): each accepting therapist takes the longest unassigned leg.
 */

export interface AssignableLeg {
  duration: number;
}

/**
 * Assigns therapists to legs by descending duration.
 *
 * @param legs          Legs in their original (insertion) order.
 * @param therapistIds  Therapists in priority order — index 0 is served first
 *                      (gets the longest leg), index 1 next, etc.
 * @returns A therapist id (or null) per leg, aligned to the input `legs` order.
 *          Legs with no matching therapist (broadcast, or fewer therapists than
 *          legs) get null.
 */
export function assignLegsToTherapists(
  legs: AssignableLeg[],
  therapistIds: string[],
): (string | null)[] {
  const byDurationDesc = legs
    .map((leg, index) => ({ index, duration: leg.duration }))
    .sort((a, b) => b.duration - a.duration || a.index - b.index);

  const result: (string | null)[] = legs.map(() => null);
  byDurationDesc.forEach((entry, rank) => {
    result[entry.index] = therapistIds[rank] ?? null;
  });
  return result;
}
