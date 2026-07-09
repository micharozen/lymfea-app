/**
 * "My leg" helpers shared by the therapist PWA surfaces (Dashboard KPI,
 * Statistics/earnings, BookingDetail) so they all compute a therapist's share
 * of a booking identically — and consistently with the payout backend.
 *
 * Duration attribution priority (see myLegDuration):
 *  1. Solo (guestCount ≤ 1)            → the full treatment duration.
 *  2. Stable link present              → the therapist's own booking_treatments
 *     (booking_treatments.therapist_id)  rows (new bookings, Phase 1).
 *  3. Positional fallback              → computeDuoLegs (older bookings / shared-
 *     duos where no line carries a therapist_id yet — no retroactive migration).
 */

import { computeTherapistEarnings, type TherapistRates } from "./therapistEarnings.ts";
import { computeDuoLegs } from "./duoLegs.ts";

export interface LegTreatment {
  therapist_id: string | null;
  duration: number | null;
}

const sumDurations = (treatments: LegTreatment[]): number =>
  treatments.reduce((sum, t) => sum + (t.duration || 0), 0);

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
  if (guestCount <= 1) return sumDurations(treatments);

  // Stable link (Phase 1): at least one line names its therapist.
  const hasStableLink = treatments.some((t) => t.therapist_id != null);
  if (hasStableLink) {
    return treatments
      .filter((t) => t.therapist_id === myTherapistId)
      .reduce((sum, t) => sum + (t.duration || 0), 0);
  }

  // Positional fallback (older bookings / shared-duos).
  const legs = computeDuoLegs(orderedTherapistIds, treatments, guestCount);
  const mine = legs.find((l) => l.therapistId === myTherapistId);
  if (mine) return mine.duration;
  return treatments[0]?.duration ?? 0;
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
