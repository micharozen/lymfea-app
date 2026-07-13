import type Stripe from "https://esm.sh/stripe@18.5.0";

// Helpers de remboursement Stripe partagés entre `cancel-booking` (remboursement
// couplé à l'annulation) et l'action `stripe-payment#refund` (remboursement admin
// autonome). Centralise la gestion idempotente et la vérification "déjà remboursé".

export function getStripeErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: string }).code);
  }
  return undefined;
}

export function getStripeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isRecoverableStripeStateError(err: unknown): boolean {
  const code = getStripeErrorCode(err);
  const message = getStripeErrorMessage(err).toLowerCase();
  return (
    code === "charge_already_refunded" ||
    code === "payment_intent_unexpected_state" ||
    message.includes("already been refunded") ||
    message.includes("already canceled") ||
    message.includes("already cancelled") ||
    message.includes("has already been canceled") ||
    message.includes("has already been cancelled")
  );
}

export async function getRefundedAmountForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{ refundedCents: number; refundId: string | null }> {
  let refundedCents = 0;
  let refundId: string | null = null;
  let startingAfter: string | undefined;

  do {
    const refunds = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const refund of refunds.data) {
      if (refund.status === "failed" || refund.status === "canceled") continue;
      refundedCents += refund.amount;
      refundId ??= refund.id;
    }

    startingAfter = refunds.has_more
      ? refunds.data[refunds.data.length - 1]?.id
      : undefined;
  } while (startingAfter);

  return { refundedCents, refundId };
}

/**
 * Crée un remboursement idempotent sur un PaymentIntent. En cas d'état déjà
 * remboursé (double-submit, race), vérifie le montant réellement remboursé
 * côté Stripe et renvoie l'ID existant plutôt que d'échouer.
 *
 * `idempotencyKey` doit être unique par intention de remboursement distincte :
 * pour des remboursements partiels successifs, inclure le montant et l'état
 * déjà remboursé dans la clé.
 */
export async function refundPaymentIntentWithVerification(
  stripe: Stripe,
  idempotencyKey: string,
  paymentIntentId: string,
  refundCents: number,
  preExistingRefundedCents: number | null,
): Promise<{ stripeRefundId: string | null; warnings: string[] }> {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundCents,
    }, {
      idempotencyKey,
    });
    return { stripeRefundId: refund.id, warnings: [] };
  } catch (err) {
    if (!isRecoverableStripeStateError(err)) throw err;

    const { refundedCents, refundId } = await getRefundedAmountForPaymentIntent(stripe, paymentIntentId);
    const expectedRefundedCents = (preExistingRefundedCents ?? 0) + refundCents;
    if (refundedCents >= expectedRefundedCents) {
      return { stripeRefundId: refundId, warnings: ["refund_already_applied_verified"] };
    }
    throw err;
  }
}
