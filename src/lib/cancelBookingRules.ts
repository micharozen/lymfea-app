/** Stripe refund/settlement applies only when the booking was actually charged. */
export function needsRefundOnCancel(
  paymentStatus?: string | null,
  paymentMethod?: string | null,
): boolean {
  if (paymentMethod === "partner_billed") return false;
  if (paymentStatus === "charged_to_room") return false;
  return paymentStatus === "paid";
}

export function canCancelBookingByStatus(status?: string | null): boolean {
  return status !== "cancelled" && status !== "completed";
}
