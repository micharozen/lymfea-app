/**
 * Libellés et regroupements des modes de paiement (bookings.payment_method).
 *
 * Distinction importante pour le pointage comptable :
 * - `card` désigne un encaissement en ligne (tunnel client, lien de paiement).
 *   Il est écrit par le système (stripe-webhook, handleCheckoutSuccess,
 *   finalizePayment) et reste sélectionnable à la main pour régulariser une
 *   réservation encaissée en ligne hors tunnel.
 * - `card_on_site` désigne une CB encaissée sur place (Tap to Pay ou terminal),
 *   qui ne remonte pas dans le tableau de bord Stripe de la même façon.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  room: "Facturé en chambre",
  card: "Paiement en ligne",
  card_on_site: "CB sur place",
  cash: "Espèces",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher — encaissé par le lieu",
  partner_billed: "Facturé au partenaire (fin de mois)",
  cure_fresha: "Cure Fresha",
  bundle: "Forfait",
};

/**
 * Modes qu'un admin peut sélectionner à la main ("Marquer comme payé" /
 * "Modifier la méthode de paiement"). `bundle` en est volontairement absent :
 * il est écrit par le système lors de la consommation d'un forfait.
 */
export const MANUAL_PAYMENT_METHODS = [
  "room",
  "card",
  "card_on_site",
  "cash",
  "offert",
  "gift_amount",
  "voucher",
  "partner_billed",
] as const;

/** Lieu EÏA — même identifiant en staging et en production. */
export const EIA_VENUE_ID = "f398bea6-839c-4388-9a79-56f36f281502";

/**
 * Modes réservés à un lieu donné, en plus de MANUAL_PAYMENT_METHODS.
 * `cure_fresha` correspond aux cures vendues via Fresha, propres à EÏA.
 */
export const VENUE_SPECIFIC_PAYMENT_METHODS: Record<string, readonly string[]> = {
  [EIA_VENUE_ID]: ["cure_fresha"],
};

/** Modes saisissables à la main pour un lieu donné. */
export function manualPaymentMethodsForVenue(hotelId: string | null | undefined): string[] {
  const venueSpecific = hotelId ? VENUE_SPECIFIC_PAYMENT_METHODS[hotelId] ?? [] : [];
  return [...MANUAL_PAYMENT_METHODS, ...venueSpecific];
}

/** Valeur de filtre ciblant les réservations sans mode de paiement renseigné. */
export const PAYMENT_METHOD_UNSET = "unset";

/** Options du filtre "mode de paiement" de la liste des réservations. */
export const PAYMENT_METHOD_FILTER_OPTIONS: { value: string; label: string }[] = [
  ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
  { value: PAYMENT_METHOD_UNSET, label: "Non renseigné" },
];

/** Options du filtre "statut de paiement" de la liste des réservations. */
export const PAYMENT_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "paid", label: "Payé" },
  { value: "pending", label: "En attente" },
  { value: "awaiting_payment", label: "Paiement attendu" },
  { value: "charged_to_room", label: "Facturé en chambre" },
  { value: "offert", label: "Offert" },
  { value: "card_saved", label: "Carte enregistrée" },
  { value: "refunded", label: "Remboursé" },
  { value: "failed", label: "Échoué" },
];

/** Libellé lisible d'un mode de paiement, avec repli sur la valeur brute. */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
