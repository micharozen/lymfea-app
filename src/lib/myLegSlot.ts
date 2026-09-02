import {
  legWindowForLines,
  displayLegTreatments,
  addMinutesToClock,
} from "@/lib/therapistLegDuration";
import { toScheduledLines, type PwaScheduledLine } from "@/lib/pwaScheduledLines";

/**
 * Créneau réellement travaillé par un praticien sur une réservation partagée.
 *
 * Sur un booking simple à plusieurs soins pris par plusieurs praticiens (issue
 * #547), les soins s'enchaînent : la réservation occupe 14h00–15h45, mais celui
 * qui n'assure que le second soin ne commence qu'à 15h00. Son agenda annonçait
 * pourtant le créneau entier, l'ouvrant à un double engagement sur une heure où
 * il est libre.
 *
 * L'ordre d'exécution et le rattachement des add-ons viennent du moteur partagé
 * (`scheduleTreatments`) : agenda, fiche et notifications parlent ainsi du même
 * enchaînement. Rien n'est déplacé hors du partage — un praticien seul garde le
 * créneau de la réservation, et un duo son heure de début (jambes parallèles).
 */
export interface MyLegSlotBooking<L extends PwaScheduledLine = PwaScheduledLine> {
  booking_time: string;
  duration?: number | null;
  guest_count?: number | null;
  booking_treatments?: L[];
}

export function myLegSlot<L extends PwaScheduledLine>(
  b: MyLegSlotBooking<L>,
  therapistId: string | null | undefined,
): { booking_time: string; duration: number | null | undefined; booking_treatments?: L[] } {
  const whole = {
    booking_time: b.booking_time,
    duration: b.duration,
    booking_treatments: b.booking_treatments,
  };
  if (!therapistId) return whole;

  const lines = b.booking_treatments ?? [];
  const mine = lines.filter((l) => l.therapist_id === therapistId);
  if (mine.length === 0 || mine.length === lines.length) return whole;

  const scheduled = toScheduledLines(lines);
  const window = legWindowForLines(
    scheduled,
    mine.map((l) => l.id).filter((id): id is string => !!id),
    b.guest_count ?? 1,
  );

  return {
    // `addMinutesToClock` rend « HH:MM » ; les vues attendent « HH:MM:SS ».
    booking_time: `${addMinutesToClock(b.booking_time.substring(0, 5), window.startOffset)}:00`,
    duration: window.duration,
    booking_treatments: displayLegTreatments(therapistId, scheduled),
  };
}
