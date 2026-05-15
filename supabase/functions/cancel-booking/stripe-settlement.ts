import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface BookingPaymentInfo {
  stripe_payment_intent_id: string | null;
  stripe_setup_intent_id: string | null;
}

export interface StripeSettlementInput {
  stripe: Stripe;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentInfo: BookingPaymentInfo | null;
  needsRefund: boolean;
  feeApplied: number;
  refundAmount: number;
  skipStripe: boolean;
}

export interface StripeSettlementResult {
  stripeRefundId: string | null;
  setupIntentCancelled: boolean;
  warnings: string[];
}

function getStripeErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: string }).code);
  }
  return undefined;
}

function getStripeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Treat as success (idempotent) — do not block DB cancellation. */
export function isStripeIdempotentError(err: unknown): boolean {
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

const SETUP_INTENT_CANCELABLE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "processing",
]);

const SETUP_INTENT_RELEASE_STATUSES = new Set([
  "card_saved",
  "pending",
  "awaiting_payment",
]);

async function settlePaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
  feeApplied: number,
  refundAmount: number,
): Promise<{ stripeRefundId: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status === "canceled") {
    warnings.push("pi_already_canceled");
    return { stripeRefundId: null, warnings };
  }

  if (pi.status === "requires_capture") {
    if (feeApplied > 0) {
      const captureCents = Math.min(
        Math.round(feeApplied * 100),
        pi.amount_capturable ?? pi.amount,
      );
      if (captureCents > 0) {
        await stripe.paymentIntents.capture(pi.id, { amount_to_capture: captureCents });
        console.log("[stripe-settlement] Pre-auth partial capture (late fee):", pi.id, captureCents);
      }
    } else {
      await stripe.paymentIntents.cancel(pi.id);
      console.log("[stripe-settlement] Pre-auth cancelled:", pi.id);
    }
    return { stripeRefundId: null, warnings };
  }

  if (pi.status === "succeeded") {
    const refundCents = Math.round(refundAmount * 100);
    if (refundCents > 0) {
      const refund = await stripe.refunds.create({
        payment_intent: pi.id,
        amount: refundCents,
      });
      console.log("[stripe-settlement] Refund created:", refund.id, "amount:", refundCents);
      return { stripeRefundId: refund.id, warnings };
    }
    warnings.push("no_refund_needed");
    return { stripeRefundId: null, warnings };
  }

  warnings.push(`pi_status_${pi.status}_no_action`);
  return { stripeRefundId: null, warnings };
}

async function cancelSetupIntentIfNeeded(
  stripe: Stripe,
  setupIntentId: string,
): Promise<{ setupIntentCancelled: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const si = await stripe.setupIntents.retrieve(setupIntentId);

  if (si.status === "canceled") {
    warnings.push("si_already_canceled");
    return { setupIntentCancelled: true, warnings };
  }

  if (SETUP_INTENT_CANCELABLE_STATUSES.has(si.status)) {
    await stripe.setupIntents.cancel(setupIntentId);
    console.log("[stripe-settlement] SetupIntent cancelled:", setupIntentId);
    return { setupIntentCancelled: true, warnings };
  }

  if (si.status === "succeeded") {
    warnings.push("si_succeeded_card_saved_no_release");
    return { setupIntentCancelled: false, warnings };
  }

  warnings.push(`si_status_${si.status}_no_action`);
  return { setupIntentCancelled: false, warnings };
}

export async function runStripeSettlement(
  input: StripeSettlementInput,
): Promise<StripeSettlementResult> {
  const warnings: string[] = [];
  let stripeRefundId: string | null = null;
  let setupIntentCancelled = false;

  if (input.skipStripe) {
    warnings.push("skip_partner_or_room");
    return { stripeRefundId, setupIntentCancelled, warnings };
  }

  const { stripe, paymentInfo, needsRefund, feeApplied, refundAmount, paymentStatus } = input;

  try {
    if (needsRefund && paymentInfo?.stripe_payment_intent_id) {
      const piResult = await settlePaymentIntent(
        stripe,
        paymentInfo.stripe_payment_intent_id,
        feeApplied,
        refundAmount,
      );
      stripeRefundId = piResult.stripeRefundId;
      warnings.push(...piResult.warnings);
    } else if (needsRefund) {
      warnings.push("needs_refund_but_no_pi");
    } else if (paymentInfo?.stripe_payment_intent_id) {
      // Defensive: release pre-auth even if DB payment_status is not yet "paid"
      const pi = await stripe.paymentIntents.retrieve(paymentInfo.stripe_payment_intent_id);
      if (pi.status === "requires_capture") {
        const piResult = await settlePaymentIntent(
          stripe,
          paymentInfo.stripe_payment_intent_id,
          feeApplied,
          refundAmount,
        );
        stripeRefundId = piResult.stripeRefundId;
        warnings.push(...piResult.warnings, "pi_requires_capture_pre_paid_status");
      }
    }

    const shouldReleaseSetup =
      !needsRefund &&
      !!paymentInfo?.stripe_setup_intent_id &&
      SETUP_INTENT_RELEASE_STATUSES.has(paymentStatus ?? "");

    if (shouldReleaseSetup && paymentInfo?.stripe_setup_intent_id) {
      const siResult = await cancelSetupIntentIfNeeded(stripe, paymentInfo.stripe_setup_intent_id);
      setupIntentCancelled = siResult.setupIntentCancelled;
      warnings.push(...siResult.warnings);
    }

    if (!needsRefund && !paymentInfo?.stripe_payment_intent_id && !paymentInfo?.stripe_setup_intent_id) {
      warnings.push("no_stripe_ids");
    }
  } catch (err) {
    if (isStripeIdempotentError(err)) {
      warnings.push("stripe_idempotent_error");
      console.log("[stripe-settlement] Idempotent Stripe state:", getStripeErrorMessage(err));
    } else {
      throw err;
    }
  }

  return { stripeRefundId, setupIntentCancelled, warnings };
}
