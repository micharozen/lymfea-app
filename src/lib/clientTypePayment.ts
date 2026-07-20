import { isPartnerBilledClientType, type BookingClientType } from "@/lib/clientTypeMeta";

export interface DerivedPayment {
  paymentMethod: string | null;
  paymentStatus: string | null;
}

// Statuts à ne jamais écraser lors d'un changement de type de client.
const LOCKED_PAYMENT_STATUSES = ["paid", "refunded"];

/**
 * Vrai si la réservation est réglée par un partenaire (Staycation, ClassPass…).
 * Le statut historique "pending_partner_billing" est encore reconnu pour les
 * réservations créées avant la bascule vers payment_status = "paid".
 */
export function isPartnerBilledBooking(
  paymentMethod: string | null | undefined,
  paymentStatus?: string | null,
): boolean {
  return paymentMethod === "partner_billed" || paymentStatus === "pending_partner_billing";
}

/**
 * Dérive payment_method / payment_status à partir du type de client.
 * Source de vérité partagée entre la création et l'édition d'une réservation.
 */
export function derivePaymentForClientType(
  clientType: BookingClientType,
  opts?: { payByVoucher?: boolean; isOffert?: boolean },
): DerivedPayment {
  const payByVoucher = opts?.payByVoucher ?? false;
  // Une réservation offerte (gratuite) prime sur tout : ni voucher, ni
  // facturation chambre/partenaire.
  if (opts?.isOffert) {
    return { paymentMethod: "offert", paymentStatus: "offert" };
  }
  if (payByVoucher && (clientType === "hotel" || clientType === "external")) {
    return { paymentMethod: "voucher", paymentStatus: "paid" };
  }
  if (clientType === "hotel") {
    return { paymentMethod: "room", paymentStatus: "charged_to_room" };
  }
  // Le client a réglé le partenaire : plus rien n'est dû à l'établissement, la
  // réservation est donc "paid". Le canal (et donc le fait que l'encaissement
  // vient d'un partenaire) est porté par payment_method, le partenaire précis
  // par client_type.
  if (isPartnerBilledClientType(clientType)) {
    return { paymentMethod: "partner_billed", paymentStatus: "paid" };
  }
  return { paymentMethod: null, paymentStatus: "pending" };
}

/**
 * Statut à afficher, distinct du statut stocké. Une facturation partenaire est
 * stockée "paid" (rien n'est dû par le client) mais reste présentée comme
 * "Paiement partenaire" : ce helper permet aux tables de libellés existantes,
 * indexées par statut, de rester inchangées.
 */
export function effectivePaymentStatus(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
): string {
  if (isPartnerBilledBooking(paymentMethod, paymentStatus)) return "pending_partner_billing";
  return paymentStatus ?? "pending";
}

/**
 * Vrai si le paiement est abouti et ne doit pas être recalculé.
 *
 * Une facturation partenaire est "paid" sans encaissement réel : changer le
 * type de client doit continuer à recalculer le paiement, sinon la réservation
 * resterait figée sur l'ancien partenaire.
 */
export function isPaymentStatusLocked(
  status: string | null | undefined,
  paymentMethod?: string | null,
): boolean {
  if (isPartnerBilledBooking(paymentMethod, status)) return false;
  return !!status && LOCKED_PAYMENT_STATUSES.includes(status);
}
