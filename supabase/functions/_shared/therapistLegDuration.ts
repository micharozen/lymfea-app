/**
 * "My leg" helpers shared by the therapist PWA surfaces (Dashboard KPI,
 * Statistics/earnings, BookingDetail) so they all compute a therapist's share
 * of a booking identically — and consistently with the payout backend.
 *
 * A therapist's leg is one base soin plus the add-ons hanging off it. Add-ons
 * are attributed by their own stable link (they are claimed together with their
 * parent soin in accept_booking), never positionally.
 *
 * Duration attribution priority (see myLegDuration):
 *  1. Solo (guestCount ≤ 1)            → every treatment, add-ons included.
 *  2. Combo-duo with a stable link     → the base soins carrying my therapist_id.
 *  3. Shared-duo (fewer base soins     → the lone soin, worked in parallel by
 *     than guests)                       every therapist.
 *  4. Positional fallback              → computeDuoLegs (older bookings where no
 *     line carries a therapist_id yet — no retroactive migration).
 * In every duo branch the add-ons I carry are added on top.
 */

import { computeTherapistEarnings, type TherapistRates } from "./therapistEarnings.ts";
import { computeDuoLegs } from "./duoLegs.ts";

export interface LegTreatment {
  therapist_id?: string | null;
  duration: number | null;
  is_addon?: boolean | null;
}

const sumDurations = (treatments: LegTreatment[]): number =>
  treatments.reduce((sum, t) => sum + (t.duration || 0), 0);

/**
 * The treatments the given therapist is paid for on this booking — their base
 * soin(s) plus the add-ons they carry. Same attribution ladder as
 * `myLegDuration` (which is its sum), so any surface listing a therapist's
 * prestations (auto-facture, recap) shows exactly what they are paid for.
 * `orderedTherapistIds` must be the accepted `booking_therapists` sorted by
 * `assigned_at` (stable positional order) for the fallback branch.
 */
export function myLegTreatments<T extends LegTreatment>(
  myTherapistId: string,
  treatments: T[],
  orderedTherapistIds: string[],
  guestCount: number,
): T[] {
  if (guestCount <= 1) return treatments;

  const bases = treatments.filter((t) => !t.is_addon);
  const myAddons = treatments.filter((t) => t.is_addon && t.therapist_id === myTherapistId);

  // Combo-duo with the stable link set: one base soin per guest.
  if (bases.length === guestCount && bases.some((t) => t.therapist_id != null)) {
    return [...bases.filter((t) => t.therapist_id === myTherapistId), ...myAddons];
  }

  // Shared-duo: fewer base soins than guests → the lone soin is worked in
  // parallel by everyone, whether or not it already names one of them.
  if (bases.length < guestCount) {
    return [...(bases[0] ? [bases[0]] : []), ...myAddons];
  }

  // Positional fallback (older bookings, no line carries a therapist_id).
  const legs = computeDuoLegs(orderedTherapistIds, bases, guestCount);
  const index = legs.findIndex((l) => l.therapistId === myTherapistId);
  const mine = index >= 0 && bases.length === guestCount ? bases[index] : bases[0];
  return [...(mine ? [mine] : []), ...myAddons];
}

/**
 * Minutes the given therapist is paid for on this booking.
 * `orderedTherapistIds` must be the accepted `booking_therapists` sorted by
 * `assigned_at` (stable positional order) for the fallback branch.
 */
export function myLegDuration(
  myTherapistId: string,
  treatments: LegTreatment[],
  orderedTherapistIds: string[],
  guestCount: number,
): number {
  return sumDurations(myLegTreatments(myTherapistId, treatments, orderedTherapistIds, guestCount));
}

/**
 * Wall-clock minutes a booking occupies on a calendar, used when
 * `bookings.duration` is missing. A solo adds its treatments up; a duo runs one
 * leg per guest IN PARALLEL, so the slot lasts as long as the longest leg —
 * never the sum (which would stretch a 2×75 min duo to 2h30).
 */
export function bookingSlotDuration(treatments: LegTreatment[], guestCount: number): number {
  if (guestCount <= 1) return sumDurations(treatments);

  const bases = treatments.filter((t) => !t.is_addon);
  const addons = treatments.filter((t) => t.is_addon);
  if (bases.length === 0) return sumDurations(treatments);

  // Shared-duo: a single soin worked in parallel by every therapist.
  if (bases.length < guestCount) return (bases[0].duration || 0) + sumDurations(addons);

  // Stable link set: group the soins per therapist, the slot is the longest leg.
  if (bases.every((t) => t.therapist_id != null)) {
    const byTherapist = new Map<string, number>();
    for (const t of [...bases, ...addons]) {
      if (t.therapist_id == null) continue;
      byTherapist.set(t.therapist_id, (byTherapist.get(t.therapist_id) ?? 0) + (t.duration || 0));
    }
    const unlinkedAddons = sumDurations(addons.filter((t) => t.therapist_id == null));
    return Math.max(...byTherapist.values()) + unlinkedAddons;
  }

  // Combo-duo without the link: one base soin per guest, worked in parallel.
  if (bases.length === guestCount) {
    return Math.max(...bases.map((t) => t.duration || 0)) + sumDurations(addons);
  }

  // More soins than guests and nothing to group them by: keep the safe upper bound.
  return sumDurations(treatments);
}

export interface EstimateTherapistShareInput {
  /** booking.global_therapist_commission — false = fixed-rate mode (Eïa). */
  globalTherapistCommission: boolean | null;
  guestCount: number;
  /** Minutes the therapist is paid for (from myLegDuration). */
  legDuration: number;
  /** Rates of the CONNECTED therapist (never the booking's primary snapshot). */
  myRates: TherapistRates | null | undefined;
  /** Gross booking price (used only in commission-% mode). */
  grossPrice: number;
  /** booking.therapist_commission (%), only used in commission-% mode. */
  therapistCommissionPercent: number | null;
  /** Out-of-hours uplift percent, or 0 when the booking is not out-of-hours. */
  surchargePercent: number;
}

/**
 * Estimated payout for the connected therapist on a single booking. Mirrors the
 * two modes used in BookingDetail: fixed rate×duration (Eïa default) or a
 * commission % on the therapist's share of the total.
 */
export function estimateTherapistShare(input: EstimateTherapistShareInput): number {
  const {
    globalTherapistCommission,
    guestCount,
    legDuration,
    myRates,
    grossPrice,
    therapistCommissionPercent,
    surchargePercent,
  } = input;

  if (globalTherapistCommission === false) {
    return computeTherapistEarnings(myRates, legDuration, { surchargePercent }) ?? 0;
  }

  const pricePerTherapist = grossPrice / Math.max(guestCount || 1, 1);
  return Math.round(pricePerTherapist * ((therapistCommissionPercent || 70) / 100) * 100) / 100;
}
