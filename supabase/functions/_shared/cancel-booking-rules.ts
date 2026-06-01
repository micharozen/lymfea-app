/** Statuses where only a card hold / SetupIntent exists (no capture yet). */
export const PRE_AUTH_PAYMENT_STATUSES = [
  "pending",
  "awaiting_payment",
  "card_saved",
] as const;

export type PreAuthPaymentStatus = (typeof PRE_AUTH_PAYMENT_STATUSES)[number];

const NON_STRIPE_PAYMENT_METHODS = new Set([
  "partner_billed",
  "gift_amount",
  "voucher",
  "offert",
  "cash",
]);

/**
 * Whether cancel should refund captured Stripe funds (not empreinte / pre-auth release).
 * Keep in sync with src/lib/cancelBookingRules.ts — needsRefundOnCancel()
 */
export function needsStripeSettlementOnCancel(
  paymentStatus?: string | null,
  paymentMethod?: string | null,
): boolean {
  if (NON_STRIPE_PAYMENT_METHODS.has(paymentMethod ?? "")) return false;
  if (paymentStatus === "charged_to_room") return false;
  return paymentStatus === "paid";
}
