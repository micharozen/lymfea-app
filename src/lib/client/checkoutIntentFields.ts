/** Spread into booking / Stripe payloads when a checkout intent was created at Guest Info. */
export function checkoutIntentFields(checkoutIntentId: string | null | undefined) {
  return checkoutIntentId ? { checkoutIntentId } : {};
}
