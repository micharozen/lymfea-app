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
 *  1. Shared-duo (fewer base soins     → the lone soin, worked in parallel by
 *     than guests)                       every therapist.
 *  2. Plusieurs praticiens + lien posé → the base soins carrying my therapist_id.
 *  3. Praticien seul (ou guestCount≤1) → every treatment, add-ons included.
 *  4. Positional fallback              → computeDuoLegs (older bookings where no
 *     line carries a therapist_id yet — no retroactive migration).
 * In every split branch the add-ons I carry are added on top.
 *
 * La branche 2 est le critère structurant depuis le partage d'un booking simple
 * (issue #547) : ce n'est PAS `guest_count` qui dit si une réservation est
 * partagée — un solo enchaînant corps + visage peut mobiliser deux praticiens —
 * mais la conjonction « plusieurs praticiens » ET « lien posé ». Le seul lien ne
 * suffit pas : une jambe restée NULL signifie « pas encore pourvue » sur une
 * réservation partagée, mais « claim partiel » sur les réservations antérieures,
 * où le praticien unique assurait pourtant tout.
 */

import {
  computeLegEarnings,
  type EarningLine,
  type TherapistRates,
  type TreatmentRateMap,
} from "./therapistEarnings.ts";
import { computeDuoLegs } from "./duoLegs.ts";

export interface LegTreatment {
  therapist_id?: string | null;
  duration: number | null;
  is_addon?: boolean | null;
  /** `booking_treatments.treatment_id` — porte le barème spécifique éventuel du soin. */
  treatment_id?: string | null;
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
  const bases = treatments.filter((t) => !t.is_addon);
  const myAddons = treatments.filter((t) => t.is_addon && t.therapist_id === myTherapistId);

  // Shared-duo: fewer base soins than guests → the lone soin is worked in
  // parallel by everyone, whether or not it already names one of them. Testé
  // avant le lien : la ligne unique peut nommer un seul des deux praticiens.
  if (bases.length > 0 && bases.length < guestCount) {
    return [...bases.slice(0, 1), ...myAddons];
  }

  // Réservation partagée : PLUSIEURS praticiens y participent, le lien est posé,
  // et les soins de base ne pointent pas tous vers moi — chacun n'est alors payé
  // que sur les lignes qu'il porte. Couvre le combo-duo et le booking simple
  // enchaînant plusieurs soins (issue #547).
  //
  // La condition « plusieurs praticiens » n'est pas décorative : jusqu'ici un
  // praticien seul sur un booking simple à deux soins ne réclamait QUE la
  // première ligne (claim LIMIT 1), la seconde restant NULL. Ces réservations
  // existent en base. Sans ce garde-fou, elles seraient relues comme partagées et
  // leur unique praticien perdrait la moitié de sa rémunération — y compris sur
  // des factures régénérées après coup.
  if (
    orderedTherapistIds.length > 1 &&
    bases.some((t) => t.therapist_id != null) &&
    !bases.every((t) => t.therapist_id === myTherapistId)
  ) {
    return [...bases.filter((t) => t.therapist_id === myTherapistId), ...myAddons];
  }

  // Aucun lien exploitable : un praticien seul est payé sur tout.
  if (guestCount <= 1) return treatments;

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
  /**
   * Lignes dont `legDuration` est la somme (from myLegTreatments). Optionnel :
   * sans elles, aucun barème spécifique ne peut s'appliquer et le calcul reste
   * celui du barème par défaut.
   */
  legLines?: EarningLine[];
  /** Rates of the CONNECTED therapist (never the booking's primary snapshot). */
  myRates: TherapistRates | null | undefined;
  /** Barèmes par soin du thérapeute connecté, ou null s'il les a désactivés. */
  myTreatmentRates?: TreatmentRateMap | null;
  /** Gross booking price (used only in commission-% mode). */
  grossPrice: number;
  /**
   * Prix des seules prestations attribuées à ce praticien (mode commission-%).
   * Fourni dès que l'appelant connaît la jambe ; à défaut, la base reste
   * `grossPrice / guestCount`.
   */
  legGrossPrice?: number | null;
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
    legLines,
    myRates,
    myTreatmentRates,
    grossPrice,
    legGrossPrice,
    therapistCommissionPercent,
    surchargePercent,
  } = input;

  if (globalTherapistCommission === false) {
    return (
      computeLegEarnings(
        myRates,
        myTreatmentRates ?? null,
        { totalDuration: legDuration, lines: legLines },
        { surchargePercent },
      ) ?? 0
    );
  }

  // Mode commission : la base est la part du praticien dans la réservation.
  // `legGrossPrice` la porte quand l'appelant sait quelles prestations lui
  // reviennent — indispensable sur une réservation partagée entre praticiens de
  // spécialités différentes, où les jambes n'ont ni le même prix ni la même
  // durée (issue #547). Sans elle, on retombe sur le partage par invité, qui
  // reste juste pour un duo de soins identiques.
  const pricePerTherapist = legGrossPrice ?? grossPrice / Math.max(guestCount || 1, 1);
  return Math.round(pricePerTherapist * ((therapistCommissionPercent || 70) / 100) * 100) / 100;
}
