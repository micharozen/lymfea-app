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
 * Paiement différé : partenaire OU hôtel (chambre). Sert aux notices client
 * « aucun paiement sur place » dans les emails de confirmation.
 */
export function isDeferredBillingClientType(clientType: string | null | undefined): boolean {
  return isPartnerBilledClientType(clientType) || clientType === "hotel";
}

/** Normalise une valeur brute en BookingClientType, avec repli sur "external". */
export function normalizeClientType(value: string | null | undefined): BookingClientType {
  return (BOOKING_CLIENT_TYPES as string[]).includes(value ?? "")
    ? (value as BookingClientType)
    : "external";
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
