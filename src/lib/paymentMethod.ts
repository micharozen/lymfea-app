/**
 * Libellés et regroupements des modes de paiement (bookings.payment_method).
 *
 * Distinction importante pour le pointage comptable :
 * - `card` désigne exclusivement un encaissement Stripe (paiement en ligne du
 *   flow client, ou lien de paiement envoyé). Il n'est écrit que par le système
 *   (stripe-webhook, handleCheckoutSuccess, finalizePayment) et n'est donc pas
 *   proposé à la saisie manuelle : voir MANUAL_PAYMENT_METHODS.
 * - `card_on_site` désigne une CB encaissée sur place (Tap to Pay ou terminal),
 *   qui ne remonte pas dans le tableau de bord Stripe de la même façon.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  room: "Facturé en chambre",
  card: "Stripe (en ligne / lien)",
  card_on_site: "CB sur place",
  cash: "Espèces",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher — encaissé par le lieu",
  partner_billed: "Facturé au partenaire (fin de mois)",
  bundle: "Forfait",
};

/**
 * Modes qu'un admin peut sélectionner à la main ("Marquer comme payé" /
 * "Modifier la méthode de paiement"). `card` et `bundle` en sont volontairement
 * absents : ils sont écrits par le système et une saisie manuelle rendrait le
 * pointage Stripe inexploitable.
 */
export const MANUAL_PAYMENT_METHODS = [
  "room",
  "card_on_site",
  "cash",
  "offert",
  "gift_amount",
  "voucher",
  "partner_billed",
] as const;

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
