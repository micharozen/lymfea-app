// Booking client_type helper shared across edge functions.
//
// A booking carries a `client_type` describing who the client is and how the
// treatment is billed. Values mirror the frontend source of truth
// (src/lib/clientTypeMeta.ts) — keep both in sync when adding a value.

export type BookingClientType =
  | "hotel"
  | "staycation"
  | "classpass"
  | "sezame"
  | "external";

export const BOOKING_CLIENT_TYPES: readonly BookingClientType[] = [
  "hotel",
  "staycation",
  "classpass",
  "sezame",
  "external",
];

// Partenaires facturés en fin de mois (paiement différé, pas d'encaissement
// sur place). Un booking hôtel est aussi facturé plus tard, mais à la chambre —
// d'où le prédicat "deferred billing" distinct ci-dessous.
const PARTNER_BILLED_CLIENT_TYPES: readonly BookingClientType[] = [
  "staycation",
  "classpass",
  "sezame",
];

/** Partenaire facturé (Staycation / ClassPass / Sezame). */
export function isPartnerBilledClientType(clientType: string | null | undefined): boolean {
  return PARTNER_BILLED_CLIENT_TYPES.includes(clientType as BookingClientType);
}

/**
 * Paiement différé : le client n'a aucune démarche de paiement à faire, la
 * facturation intervient plus tard (partenaire en fin de mois, ou hôtel sur la
 * note de chambre). Sert aux notices « aucun paiement sur place » des emails de
 * confirmation et à l'autorisation d'envoi de ces emails.
 *
 * Le type de client ne suffit PAS à trancher : depuis que le flow client public
 * transmet la case « je suis client de l'hôtel », un résident peut être typé
 * 'hotel' tout en payant par carte au moment de la réservation. Pour lui le
 * paiement n'est pas différé — d'où le paiement en paramètre obligatoire.
 */
export function isDeferredBillingBooking(
  clientType: string | null | undefined,
  payment: BookingPayment,
): boolean {
  return isPartnerBilledClientType(clientType) || isRoomChargedBooking(clientType, payment);
}

export interface BookingPayment {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
}

/** Le soin part sur la note de chambre du résident (et pas sur sa carte). */
export function isRoomChargedBooking(
  clientType: string | null | undefined,
  payment: BookingPayment,
): boolean {
  return clientType === "hotel" &&
    (payment.paymentMethod === "room" || payment.paymentStatus === "charged_to_room");
}

/** Normalise une valeur brute en BookingClientType, avec repli sur "external". */
export function normalizeClientType(value: string | null | undefined): BookingClientType {
  return (BOOKING_CLIENT_TYPES as string[]).includes(value ?? "")
    ? (value as BookingClientType)
    : "external";
}

/**
 * Type de client pour une réservation issue du flow client public.
 *
 * Le visiteur déclare lui-même s'il est client de l'hôtel à l'étape GuestInfo :
 * c'est le signal prioritaire, car un résident peut très bien payer par carte
 * plutôt que sur sa chambre. Le paiement chambre reste un repli quand le flag
 * n'a pas été transmis (onglet ouvert avant le déploiement, appel direct).
 */
export function deriveClientFlowClientType(
  isHotelGuest: boolean | undefined,
  paymentMethod: string | null | undefined,
): BookingClientType {
  return isHotelGuest || paymentMethod === "room" ? "hotel" : "external";
}

const LABELS: Record<BookingClientType, { fr: string; en: string }> = {
  hotel: { fr: "Résident hôtel", en: "Hotel guest" },
  staycation: { fr: "Staycation", en: "Staycation" },
  classpass: { fr: "ClassPass", en: "ClassPass" },
  sezame: { fr: "Sezame", en: "Sezame" },
  external: { fr: "Client externe", en: "External client" },
};

/** Libellé localisé du type de client (repli "external"). */
export function clientTypeLabel(
  clientType: string | null | undefined,
  lang: "fr" | "en" = "fr",
): string {
  return LABELS[normalizeClientType(clientType)][lang];
}
