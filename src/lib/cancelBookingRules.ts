/**
 * Cancel payment UX / Stripe settlement rules.
 * Keep in sync with supabase/functions/_shared/cancel-booking-rules.ts
 */
export const PRE_AUTH_PAYMENT_STATUSES = [
  "pending",
  "awaiting_payment",
  "card_saved",
] as const;

export type PreAuthPaymentStatus = (typeof PRE_AUTH_PAYMENT_STATUSES)[number];

/** What happens to the client's card on cancel. */
export type CancelPaymentSettlement = "none" | "release_hold" | "refund";

const NON_STRIPE_PAYMENT_METHODS = new Set([
  "partner_billed",
  "gift_amount",
  "voucher",
  "offert",
  "cash",
]);

function isPreAuthPaymentStatus(status: string | null | undefined): boolean {
  return PRE_AUTH_PAYMENT_STATUSES.includes(status as PreAuthPaymentStatus);
}

export function getCancelPaymentSettlement(
  paymentStatus?: string | null,
  paymentMethod?: string | null,
  options?: {
    stripePaymentIntentId?: string | null;
    hasCardDeposit?: boolean;
  },
): CancelPaymentSettlement {
  if (NON_STRIPE_PAYMENT_METHODS.has(paymentMethod ?? "")) return "none";
  if (paymentStatus === "charged_to_room") return "none";

  // Money was captured — real refund.
  if (paymentStatus === "paid") return "refund";

  // Pre-authorization on card (PI hold) — release, not refund.
  if (options?.stripePaymentIntentId) return "release_hold";

  // SetupIntent / empreinte (card_saved, etc.) — release, not refund.
  if (isPreAuthPaymentStatus(paymentStatus) && options?.hasCardDeposit) {
    return "release_hold";
  }

  return "none";
}

/** True only when Stripe must refund captured funds. */
export function needsRefundOnCancel(
  paymentStatus?: string | null,
  paymentMethod?: string | null,
  options?: {
    stripePaymentIntentId?: string | null;
    hasCardDeposit?: boolean;
  },
): boolean {
  return getCancelPaymentSettlement(paymentStatus, paymentMethod, options) === "refund";
}

export function hasCancelPaymentSidePanel(
  paymentStatus?: string | null,
  paymentMethod?: string | null,
  options?: {
    stripePaymentIntentId?: string | null;
    hasCardDeposit?: boolean;
  },
): boolean {
  const settlement = getCancelPaymentSettlement(paymentStatus, paymentMethod, options);
  return settlement === "refund" || settlement === "release_hold";
}

export function canCancelBookingByStatus(status?: string | null): boolean {
  return status !== "cancelled" && status !== "completed";
}
