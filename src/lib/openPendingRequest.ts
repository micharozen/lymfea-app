export interface OpenLegLine {
  therapist_id?: string | null;
  is_addon?: boolean | null;
  /** `amenity_id` non nul = commodité : elle ne consomme aucune jambe. */
  treatment_menus?: { amenity_id?: string | null } | null;
}

export interface PendingRequestShape {
  guest_count?: number | null;
  therapist_id: string | null;
  booking_therapists?: { status: string; therapist_id?: string }[];
  booking_treatments?: OpenLegLine[];
}

/**
 * Cette réservation « pending » est-elle encore à pourvoir pour ce praticien ?
 *
 * Un duo reste ouvert tant qu'il n'est pas complet (il passerait 'confirmed').
 * Un solo l'est s'il n'a aucun praticien, ou s'il est partagé : un confrère a
 * pris une prestation, une autre attend encore la sienne (issue #547). Sans ce
 * second cas, une réservation à deux soins sortait de toutes les listes dès la
 * première acceptation — `bookings.therapist_id` renseigné la rendait « prise »,
 * alors qu'elle n'appartenait à personne d'autre.
 *
 * Un praticien qui a déjà accepté n'y figure plus : `accept_booking` lui rendrait
 * 'already_accepted'. Sa part lui revient par ses propres réservations.
 */
export function isOpenPendingRequest(b: PendingRequestShape, therapistId: string): boolean {
  const acceptedByMe = !!b.booking_therapists?.some(
    (bt) => bt.therapist_id === therapistId && bt.status === "accepted",
  );

  if ((b.guest_count ?? 1) > 1) return !acceptedByMe;

  if (b.therapist_id === null) return true;
  if (acceptedByMe || b.therapist_id === therapistId) return false;

  const baseLegs = (b.booking_treatments ?? []).filter(
    (bt) => !bt.is_addon && !bt.treatment_menus?.amenity_id,
  );
  const openLegs = baseLegs.filter((bt) => !bt.therapist_id).length;

  return openLegs > 0 && openLegs < baseLegs.length;
}
