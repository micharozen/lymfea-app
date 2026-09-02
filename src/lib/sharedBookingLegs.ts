import { scheduleTreatments, addMinutesToClock } from "@/lib/therapistLegDuration";
import { toScheduledLines, type PwaScheduledLine } from "@/lib/pwaScheduledLines";

/**
 * Découpe une réservation partagée en un bloc d'agenda par jambe.
 *
 * Sur un booking simple à plusieurs soins pris par plusieurs praticiens (issue
 * #547), les soins s'enchaînent : la réservation occupe 14h00–15h45, mais chaque
 * praticien n'y tient qu'une tranche. Un bloc unique de 1h45 attribué à tout le
 * monde est faux des deux côtés — il annonce à chacun une heure qu'il ne
 * travaille pas.
 *
 * L'agenda du lieu a besoin des DEUX jambes (l'occupation de la salle reste
 * continue) : on rend donc un bloc par soin de base, à l'offset que lui donne
 * `scheduleTreatments` — même ordre d'exécution que la fiche et `accept_booking`.
 * Une jambe encore libre donne un bloc `legTherapistId: null` : elle occupe bien
 * la salle, elle attend seulement son praticien.
 *
 * Les réservations non partagées ressortent inchangées, en un seul bloc.
 */
export interface SharedLegBooking<L extends PwaScheduledLine = PwaScheduledLine> {
  id: string;
  booking_time: string;
  duration?: number | null;
  guest_count?: number | null;
  booking_treatments?: L[];
}

export interface BookingLeg {
  /** Clé de rendu : plusieurs blocs partagent le même `id` de réservation. */
  legKey: string;
  /** Praticien de cette jambe, `null` tant qu'elle n'est pas pourvue. */
  legTherapistId: string | null;
}

/** Une réservation dont les soins se répartissent entre plusieurs praticiens. */
const isShared = (bases: PwaScheduledLine[], guestCount: number): boolean => {
  if (guestCount > 1 || bases.length < 2) return false;
  const named = new Set(bases.map((l) => l.therapist_id).filter(Boolean));
  const hasFree = bases.some((l) => !l.therapist_id);
  return named.size > 1 || (named.size === 1 && hasFree);
};

export function splitSharedBookingLegs<L extends PwaScheduledLine, B extends SharedLegBooking<L>>(
  b: B,
): (B & BookingLeg)[] {
  const guestCount = b.guest_count ?? 1;
  const blocks = scheduleTreatments(toScheduledLines(b.booking_treatments ?? []), guestCount);

  // Non partagée : un seul bloc, et aucune jambe à distinguer — l'appartenance
  // se lit alors sur la réservation elle-même.
  if (!isShared(blocks.map((block) => block.base), guestCount)) {
    return [{ ...b, legKey: b.id, legTherapistId: null }];
  }

  return blocks.map((block, index) => ({
    ...b,
    legKey: `${b.id}:${block.base.id ?? index}`,
    legTherapistId: block.base.therapist_id ?? null,
    booking_time: `${addMinutesToClock(b.booking_time.substring(0, 5), block.offset)}:00`,
    duration: block.duration,
    booking_treatments: block.lines,
  }));
}
