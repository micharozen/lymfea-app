import i18n from "@/i18n";

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
export const PAYMENT_METHOD_LABEL_KEYS: Record<string, string> = {
  room: "payment.method.room",
  card: "payment.method.card",
  card_on_site: "payment.method.cardOnSite",
  cash: "payment.method.cash",
  offert: "payment.method.offert",
  gift_amount: "payment.method.giftAmount",
  voucher: "payment.method.voucher",
  partner_billed: "payment.method.partnerBilled",
  cure_fresha: "payment.method.cureFresha",
  bundle: "payment.method.bundle",
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

/** Clés (namespace `common`) du filtre "statut de paiement". */
export const PAYMENT_STATUS_FILTER_KEYS: { value: string; labelKey: string }[] = [
  { value: "paid", labelKey: "payment.status.paid" },
  { value: "pending", labelKey: "status.pending" },
  { value: "awaiting_payment", labelKey: "payment.status.awaitingPayment" },
  { value: "charged_to_room", labelKey: "payment.method.room" },
  { value: "offert", labelKey: "payment.status.offert" },
  { value: "card_saved", labelKey: "payment.status.cardSaved" },
  { value: "refunded", labelKey: "payment.status.refunded" },
  { value: "failed", labelKey: "payment.status.failedShort" },
];

/**
 * Options du filtre "mode de paiement" de la liste des réservations.
 * Fonction (et non constante) : les libellés doivent être résolus à l'appel,
 * sinon ils resteraient figés sur la langue de démarrage de l'app.
 */
export function paymentMethodFilterOptions(): { value: string; label: string }[] {
  return [
    ...Object.entries(PAYMENT_METHOD_LABEL_KEYS).map(([value, labelKey]) => ({
      value,
      label: i18n.t(labelKey, { ns: "common" }),
    })),
    { value: PAYMENT_METHOD_UNSET, label: i18n.t("payment.method.unset", { ns: "common" }) },
  ];
}

/** Options du filtre "statut de paiement" de la liste des réservations. */
export function paymentStatusFilterOptions(): { value: string; label: string }[] {
  return PAYMENT_STATUS_FILTER_KEYS.map(({ value, labelKey }) => ({
    value,
    label: i18n.t(labelKey, { ns: "common" }),
  }));
}

/** Libellé lisible d'un mode de paiement, avec repli sur la valeur brute. */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "";
  const labelKey = PAYMENT_METHOD_LABEL_KEYS[method];
  return labelKey ? i18n.t(labelKey, { ns: "common" }) : method;
}
