/**
 * Répartition d'une réservation entre les thérapeutes qui l'ont réalisée, pour
 * la section « Par thérapeute » de la clôture quotidienne.
 *
 * Avant ce module, la clôture agrégeait sur `bookings.therapist_id` seul : un
 * soin en duo remontait intégralement au thérapeute principal (cas #1575, où
 * les 380 € d'un duo Marie + Anaïs étaient imputés à Marie seule).
 *
 * L'attribution des soins réutilise `myLegTreatments`, le moteur qui pilote
 * déjà les payouts réels — lien explicite, duo partagé, puis repli positionnel.
 * Ici on lui ajoute la dimension monétaire : le prix de chaque ligne, renormalisé
 * sur `total_price` pour que la somme des parts égale exactement le CA de la
 * réservation, remises et majorations comprises.
 */

import { myLegTreatments, type LegTreatment } from "./therapistLegDuration.ts";

export interface SplitLine extends LegTreatment {
  /** Prix résolu de la ligne (resolveTreatmentPrice), avant renormalisation. */
  price: number;
}

export interface SplitPart {
  /** null = « Non assigné » (aucun thérapeute connu sur la réservation). */
  therapistId: string | null;
  /** Minutes attribuées — base de calcul de computeLegEarnings. */
  duration: number;
  /**
   * Lignes attribuées, pour repérer celles qui ont un barème spécifique par soin.
   * `duration` reste la base du calcul : elle vient de `bookings.duration` sur un
   * solo et peut différer de la somme de ces lignes.
   */
  lines: SplitLine[];
  /** Part du CA, arrondie au centime. La somme des parts vaut totalPrice. */
  revenue: number;
}

export interface SplitBookingInput {
  lines: SplitLine[];
  /**
   * `booking_therapists` acceptés, dans un ordre stable — c'est lui qui sert de
   * repli positionnel pour les résas antérieures au lien explicite.
   */
  orderedTherapistIds: string[];
  guestCount: number;
  /** `bookings.therapist_id` — repli solo et données historiques. */
  primaryTherapistId: string | null;
  totalPrice: number;
  /** `bookings.duration`, ou la somme des durées à défaut. */
  bookingDuration: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Ordre positionnel reproductible. `assigned_at` est NULL sur une partie des
 * réservations (vérifié en production), donc un tri sur ce seul champ laisserait
 * l'ordre à la merci du retour de PostgREST : on départage sur l'id.
 */
export function orderRoster(
  roster: Array<{ therapist_id: string; assigned_at?: string | null }>,
): string[] {
  return roster
    .slice()
    .sort(
      (a, b) =>
        (a.assigned_at ?? "").localeCompare(b.assigned_at ?? "") ||
        a.therapist_id.localeCompare(b.therapist_id),
    )
    .map((r) => r.therapist_id);
}

/**
 * Découpe une réservation en une part par thérapeute.
 *
 * Un solo renvoie une part unique portant la durée et le prix entiers — donc un
 * comportement strictement identique à l'agrégation précédente, ce qui garantit
 * l'absence de régression sur l'immense majorité des réservations.
 */
export function splitBookingByTherapist(input: SplitBookingInput): SplitPart[] {
  const { lines, orderedTherapistIds, guestCount, primaryTherapistId, totalPrice, bookingDuration } =
    input;

  const roster = orderedTherapistIds.length
    ? orderedTherapistIds
    : primaryTherapistId
      ? [primaryTherapistId]
      : [];

  // Un seul praticien, ou réservation sans roster exploitable : une seule part.
  // Le test ne porte plus sur `guest_count` : un booking simple enchaînant deux
  // soins peut être partagé entre deux praticiens (issue #547), et la clôture
  // doit alors créditer chacun de sa prestation — comme le fait déjà le payout.
  if (roster.length <= 1) {
    return [
      {
        therapistId: roster[0] ?? primaryTherapistId ?? null,
        duration: bookingDuration,
        lines,
        revenue: round2(totalPrice),
      },
    ];
  }

  const raw = roster.map((therapistId) => {
    const mine = myLegTreatments(therapistId, lines, roster, guestCount);
    return {
      therapistId,
      duration: mine.reduce((sum, t) => sum + (t.duration || 0), 0),
      lines: mine,
      weight: mine.reduce((sum, t) => sum + (t.price || 0), 0),
    };
  });

  // Renormalisation sur le prix réellement facturé : la somme des prix de ligne
  // s'en écarte dès qu'il y a remise, carte cadeau ou majoration hors horaires.
  // Sur un duo partagé, l'unique soin est compté pour chaque thérapeute, donc
  // le facteur vaut 0,5 et le partage 50/50 tombe sans cas particulier.
  const totalWeight = raw.reduce((sum, p) => sum + p.weight, 0);
  const parts: SplitPart[] = raw.map((p) => ({
    therapistId: p.therapistId,
    duration: p.duration,
    lines: p.lines,
    revenue: round2(totalWeight > 0 ? (p.weight / totalWeight) * totalPrice : totalPrice / roster.length),
  }));

  // Le résidu d'arrondi va à la part la plus élevée, pour que la somme des
  // parts égale le CA de la réservation au centime près.
  const residual = round2(totalPrice - parts.reduce((sum, p) => sum + p.revenue, 0));
  if (residual !== 0 && parts.length) {
    const largest = parts.reduce((best, p) => (p.revenue > best.revenue ? p : best), parts[0]);
    largest.revenue = round2(largest.revenue + residual);
  }

  return parts;
}
