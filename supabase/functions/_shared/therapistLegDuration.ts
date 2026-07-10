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

  const bases = treatments.filter((t) => !t.is_addon);
  const myAddons = sumDurations(
    treatments.filter((t) => t.is_addon && t.therapist_id === myTherapistId),
  );

  // Combo-duo with the stable link set: one base soin per guest.
  if (bases.length === guestCount && bases.some((t) => t.therapist_id != null)) {
    return sumDurations(bases.filter((t) => t.therapist_id === myTherapistId)) + myAddons;
  }

  // Shared-duo: fewer base soins than guests → the lone soin is worked in
  // parallel by everyone, whether or not it already names one of them.
  if (bases.length < guestCount) {
    return (bases[0]?.duration ?? 0) + myAddons;
  }

  // Positional fallback (older bookings, no line carries a therapist_id).
  const legs = computeDuoLegs(orderedTherapistIds, bases, guestCount);
  const mine = legs.find((l) => l.therapistId === myTherapistId);
  return (mine ? mine.duration : bases[0]?.duration ?? 0) + myAddons;
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
