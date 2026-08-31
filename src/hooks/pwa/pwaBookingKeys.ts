import type { BookingWindow } from "@/lib/pwaBookingWindow";

/**
 * Clés de cache des réservations du PWA thérapeute.
 *
 * Volontairement préfixées `["pwa","bookings"]` : impossible de collisionner
 * avec `bookingKeys.all = ["bookings"]` côté admin, ni avec les anciennes
 * chaînes `["myBookings"]` / `["pendingBookings"]` que le prefetch du Layout
 * écrivait avec une forme différente de celle que le Dashboard y relisait.
 */
export const pwaBookingKeys = {
  all: ["pwa", "bookings"] as const,
  mine: (therapistId: string, w: BookingWindow) =>
    [...pwaBookingKeys.all, "mine", therapistId, w.from, w.to] as const,
  pending: (therapistId: string, w: BookingWindow) =>
    [...pwaBookingKeys.all, "pending", therapistId, w.from, w.to] as const,
  venue: (hotelIds: string, w: BookingWindow) =>
    [...pwaBookingKeys.all, "venue", hotelIds, w.from, w.to] as const,
  /** Filet des prochaines réservations au-delà de la fenêtre du tableau de bord. */
  next: (therapistId: string, after: string, limit: number) =>
    [...pwaBookingKeys.all, "next", therapistId, after, limit] as const,
};

/** Identifiant stable d'un ensemble de lieux, pour servir de segment de clé. */
export const hotelIdsKey = (ids: string[]) => [...ids].sort().join(",");

/**
 * Colonnes réellement lues par le PWA, en remplacement de `select("*")` qui
 * rapatriait aussi les signatures, le formulaire de santé, les champs Stripe et
 * les notes internes.
 *
 * Attention avant d'élaguer : `broadcast_wave`, `declined_by`,
 * `therapist_gender_preference` et `is_out_of_hours` portent la logique de
 * vagues de diffusion et l'estimation de gain du tableau de bord. Les retirer
 * changerait silencieusement les demandes qu'un thérapeute voit.
 */
export const PWA_BOOKING_COLUMNS = [
  "id",
  "booking_id",
  "booking_date",
  "booking_time",
  "client_first_name",
  "client_last_name",
  "phone",
  "hotel_id",
  "hotel_name",
  "room_id",
  "room_number",
  "status",
  "payment_status",
  "payment_method",
  "duration",
  "total_price",
  "guest_count",
  "is_out_of_hours",
  "therapist_id",
  "therapist_name",
  "therapist_gender_preference",
  "declined_by",
  "broadcast_wave",
].join(", ");

// La contrainte FK porte encore l'ancien nom (`bookings_trunk_id_fkey`) alors
// que la colonne s'appelle room_id : le désambiguïsateur reste nécessaire car
// secondary_room_id pointe la même table.
const PWA_BOOKING_EMBEDS = `
  treatment_rooms!bookings_trunk_id_fkey ( name ),
  booking_therapists ( status, therapist_id, assigned_at ),
  booking_treatments (
    therapist_id,
    treatment_id,
    is_addon,
    treatment_menus ( name, price, duration )
  )`;

export const PWA_BOOKING_SELECT = `${PWA_BOOKING_COLUMNS},${PWA_BOOKING_EMBEDS}`;

/** Scope « tout le lieu » du concierge : ajoute le nom du thérapeute affecté. */
export const PWA_VENUE_BOOKING_SELECT =
  `${PWA_BOOKING_COLUMNS},therapists ( first_name, last_name ),${PWA_BOOKING_EMBEDS}`;

/**
 * PostgREST tronque silencieusement au-delà de ce nombre de lignes. On le pose
 * explicitement pour que la limite soit délibérée plutôt que subie : un
 * planning tronqué perd des créneaux sans lever la moindre erreur.
 */
export const PWA_BOOKING_ROW_LIMIT = 1000;
