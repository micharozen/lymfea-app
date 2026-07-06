import type { BookingClientType } from "@/lib/clientTypeMeta";

export interface DerivedPayment {
  paymentMethod: string | null;
  paymentStatus: string | null;
}

// Statuts à ne jamais écraser lors d'un changement de type de client.
const LOCKED_PAYMENT_STATUSES = ["paid", "refunded"];

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
  if (clientType === "staycation" || clientType === "classpass" || clientType === "sezame") {
    return { paymentMethod: "partner_billed", paymentStatus: "pending_partner_billing" };
  }
  return { paymentMethod: null, paymentStatus: "pending" };
}

/** Vrai si le paiement est abouti et ne doit pas être recalculé. */
export function isPaymentStatusLocked(status: string | null | undefined): boolean {
  return !!status && LOCKED_PAYMENT_STATUSES.includes(status);
}
