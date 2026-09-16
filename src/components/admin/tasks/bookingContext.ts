import type { BookingSearchResult } from "@/lib/bookingSearch";

export interface BookingContextPatch {
  booking_id: string;
  hotel_id?: string;
  treatment_date?: string;
  client_type?: string;
  treatment_menu_ids?: string[];
  therapist_ids?: string[];
  customer_id?: string;
}

/**
 * Champs d'une tâche déduits de la réservation qu'on y rattache.
 *
 * Rattacher une réservation doit éviter la double saisie : lieu, date du soin,
 * type de client, soins, thérapeutes et fiche client sont repris tels quels.
 * La règle est partagée par le formulaire de création et la vue détaillée —
 * le même geste doit produire le même résultat des deux côtés.
 *
 * Seules les valeurs réellement connues sont renvoyées : une réservation sans
 * thérapeute assigné ne doit pas effacer ceux déjà saisis sur la tâche.
 */
export function bookingContextPatch(booking: BookingSearchResult): BookingContextPatch {
  const patch: BookingContextPatch = { booking_id: booking.id };

  if (booking.hotel_id) patch.hotel_id = booking.hotel_id;
  if (booking.booking_date) patch.treatment_date = booking.booking_date;
  if (booking.client_type) patch.client_type = booking.client_type;
  if (booking.customer?.id) patch.customer_id = booking.customer.id;

  // Les add-ons sont réalisés par le thérapeute du soin de base : on ne retient
  // que les prestations principales.
  const menuIds = [
    ...new Set(
      (booking.booking_treatments ?? [])
        .filter((line) => !line.is_addon)
        .map((line) => line.treatment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (menuIds.length > 0) patch.treatment_menu_ids = menuIds;

  const therapistIds = [
    ...new Set(
      (booking.booking_therapists ?? [])
        .map((line) => line.therapist_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (therapistIds.length > 0) patch.therapist_ids = therapistIds;

  return patch;
}
