import { venueLocalToUtc } from "../_shared/venue-time.ts";

/**
 * Le créneau est-il déjà commencé (ou passé) ?
 *
 * Prévenir d'un changement sur un rendez-vous déjà entamé n'a aucun destinataire
 * utile : le praticien est sur place, le client aussi. Cela arrive surtout quand
 * l'admin corrige a posteriori une réservation de la veille — un SMS « votre
 * réservation a été modifiée » serait alors incompréhensible.
 *
 * La comparaison se fait sur l'heure de DÉBUT, dans le fuseau du lieu : un soin
 * en cours ne se re-notifie pas davantage qu'un soin terminé.
 *
 * Renvoie `false` quand la date/heure est inexploitable : dans le doute on
 * notifie, plutôt que de taire un vrai changement.
 */
export function isBookingStarted(
  bookingDate: string,
  bookingTime: string,
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const startsAt = venueLocalToUtc(bookingDate, bookingTime, timezone || "UTC");
  if (!startsAt) return false;
  return startsAt.getTime() <= now.getTime();
}
