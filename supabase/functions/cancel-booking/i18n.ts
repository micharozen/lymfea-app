export type CancelLang = "fr" | "en";

export function resolveCancelLang(language?: string | null): CancelLang {
  return language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

type Messages = {
  emailSubject: (date: string) => string;
  emailHeader: string;
  emailBadge: string;
  emailButton: string;
  clientLabel: string;
  venueLabel: string;
  roomLabel: string;
  detailsCancellation: string;
  detailsRefund: string;
  totalBooking: string;
  partnerPayment: string;
  roomChargePayment: string;
  noRefundPayment: string;
  depositPaid: string;
  cancellationFee: string;
  refunded: string;
  reason: string;
  smsCancelled: (params: {
    firstName: string;
    hotelName: string;
    date: string;
    time: string;
    refundSuffix: string;
  }) => string;
  adminEmailSubject: (bookingNumber: number | string) => string;
  adminEmailTitle: string;
  adminRefund: string;
  adminFee: string;
  adminReason: string;
  stripeError: (detail: string) => string;
};

const fr: Messages = {
  emailSubject: (date) => `❌ Votre rendez-vous du ${date} a été annulé`,
  emailHeader: "Votre rendez-vous a été annulé",
  emailBadge: "❌ Annulation",
  emailButton: "Réserver à nouveau",
  clientLabel: "Client",
  venueLabel: "Établissement",
  roomLabel: "Chambre",
  detailsCancellation: "Détails de l'annulation",
  detailsRefund: "Détails du remboursement",
  totalBooking: "Total du rendez-vous",
  partnerPayment: "Facturé au partenaire (aucun remboursement carte)",
  roomChargePayment: "Facturé en chambre (aucun remboursement carte)",
  noRefundPayment: "Aucun remboursement (paiement non encore encaissé)",
  depositPaid: "Acompte versé",
  cancellationFee: "Frais d'annulation",
  refunded: "Montant remboursé",
  reason: "Motif",
  smsCancelled: ({ firstName, hotelName, date, time, refundSuffix }) =>
    `Bonjour ${firstName}, votre soin chez ${hotelName} le ${date} à ${time} a été annulé.${refundSuffix}`,
  adminEmailSubject: (n) => `❌ Réservation #${n} annulée`,
  adminEmailTitle: "Réservation annulée",
  adminRefund: "Montant remboursé",
  adminFee: "Frais d'annulation",
  adminReason: "Motif",
  stripeError: (detail) => `Échec du remboursement Stripe : ${detail}`,
};

const en: Messages = {
  emailSubject: (date) => `❌ Your appointment on ${date} has been cancelled`,
  emailHeader: "Your appointment has been cancelled",
  emailBadge: "❌ Cancelled",
  emailButton: "Book again",
  clientLabel: "Client",
  venueLabel: "Venue",
  roomLabel: "Room",
  detailsCancellation: "Cancellation details",
  detailsRefund: "Refund details",
  totalBooking: "Appointment total",
  partnerPayment: "Billed to partner (no card refund)",
  roomChargePayment: "Charged to room (no card refund)",
  noRefundPayment: "No refund (payment not yet captured)",
  depositPaid: "Deposit paid",
  cancellationFee: "Cancellation fee",
  refunded: "Amount refunded",
  reason: "Reason",
  smsCancelled: ({ firstName, hotelName, date, time, refundSuffix }) =>
    `Hello ${firstName}, your treatment at ${hotelName} on ${date} at ${time} has been cancelled.${refundSuffix}`,
  adminEmailSubject: (n) => `❌ Booking #${n} cancelled`,
  adminEmailTitle: "Booking cancelled",
  adminRefund: "Refund amount",
  adminFee: "Cancellation fee",
  adminReason: "Reason",
  stripeError: (detail) => `Stripe refund failed: ${detail}`,
};

export function getCancelMessages(lang: CancelLang): Messages {
  return lang === "en" ? en : fr;
}

/** Same gate as confirmation SMS in notify-booking-confirmed. */
export const SMS_ELIGIBLE_PAYMENT_STATUSES = [
  "paid",
  "charged",
  "charged_to_room",
  "card_saved",
  "pending_partner_billing",
] as const;

export function shouldSendCancellationSms(booking: {
  payment_status?: string | null;
  status?: string | null;
}): boolean {
  if (booking.status === "awaiting_payment") return false;
  const status = booking.payment_status ?? "";
  return (SMS_ELIGIBLE_PAYMENT_STATUSES as readonly string[]).includes(status);
}
