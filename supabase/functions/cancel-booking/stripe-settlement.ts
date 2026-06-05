import type Stripe from "stripe";

export interface BookingPaymentInfo {
  stripe_payment_intent_id: string | null;
  stripe_setup_intent_id: string | null;
}

export interface StripeSettlementInput {
  stripe: Stripe;
  bookingId: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentInfo: BookingPaymentInfo | null;
  needsRefund: boolean;
  feeApplied: number;
  refundAmount: number;
  skipStripe: boolean;
  preExistingRefundedCents?: number | null;
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

function isRecoverableStripeStateError(err: unknown): boolean {
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

async function getRefundedAmountForPaymentIntent(
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

async function capturePaymentIntentWithVerification(
  stripe: Stripe,
  bookingId: string,
  paymentIntentId: string,
  captureCents: number,
): Promise<string[]> {
  try {
    await stripe.paymentIntents.capture(
      paymentIntentId,
      { amount_to_capture: captureCents },
      { idempotencyKey: `cancel-booking:${bookingId}:capture` },
    );
    return [];
  } catch (err) {
    if (!isRecoverableStripeStateError(err)) throw err;

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "succeeded" && (pi.amount_received ?? 0) >= captureCents) {
      return ["capture_already_applied_verified"];
    }
    throw err;
  }
}

async function cancelPaymentIntentWithVerification(
  stripe: Stripe,
  bookingId: string,
  paymentIntentId: string,
): Promise<string[]> {
  try {
    await stripe.paymentIntents.cancel(
      paymentIntentId,
      undefined,
      { idempotencyKey: `cancel-booking:${bookingId}:cancel-pi` },
    );
    return [];
  } catch (err) {
    if (!isRecoverableStripeStateError(err)) throw err;

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "canceled") {
      return ["pi_cancel_already_applied_verified"];
    }
    throw err;
  }
}

async function refundPaymentIntentWithVerification(
  stripe: Stripe,
  bookingId: string,
  paymentIntentId: string,
  refundCents: number,
  preExistingRefundedCents: number | null,
): Promise<{ stripeRefundId: string | null; warnings: string[] }> {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundCents,
    }, {
      idempotencyKey: `cancel-booking:${bookingId}:refund`,
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
  bookingId: string,
  paymentIntentId: string,
  feeApplied: number,
  refundAmount: number,
  strictSettlement: boolean,
  preExistingRefundedCents: number | null,
): Promise<{ stripeRefundId: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status === "canceled") {
    if (strictSettlement) {
      throw new Error(`payment_intent_${pi.status}_cannot_settle_paid_booking`);
    }
    warnings.push("pi_already_canceled");
    return { stripeRefundId: null, warnings };
  }

  if (pi.status === "requires_capture") {
    if (feeApplied > 0) {
      const captureCents = Math.round(feeApplied * 100);
      const capturableCents = pi.amount_capturable ?? pi.amount;
      if (captureCents > capturableCents) {
        throw new Error("payment_intent_capturable_amount_changed_before_capture");
      }
      if (captureCents > 0) {
        warnings.push(...await capturePaymentIntentWithVerification(stripe, bookingId, pi.id, captureCents));
        console.log("[stripe-settlement] Pre-auth partial capture (late fee):", pi.id, captureCents);
      }
    } else {
      warnings.push(...await cancelPaymentIntentWithVerification(stripe, bookingId, pi.id));
      console.log("[stripe-settlement] Pre-auth cancelled:", pi.id);
    }
    return { stripeRefundId: null, warnings };
  }

  if (pi.status === "succeeded") {
    const refundCents = Math.round(refundAmount * 100);
    if (refundCents > 0) {
      const refundResult = await refundPaymentIntentWithVerification(
        stripe,
        bookingId,
        pi.id,
        refundCents,
        preExistingRefundedCents,
      );
      warnings.push(...refundResult.warnings);
      console.log("[stripe-settlement] Refund settled:", refundResult.stripeRefundId, "amount:", refundCents);
      return { stripeRefundId: refundResult.stripeRefundId, warnings };
    }
    warnings.push("no_refund_needed");
    return { stripeRefundId: null, warnings };
  }

  if (strictSettlement) {
    throw new Error(`payment_intent_${pi.status}_cannot_settle_paid_booking`);
  }

  warnings.push(`pi_status_${pi.status}_no_action`);
  return { stripeRefundId: null, warnings };
}

async function cancelSetupIntentIfNeeded(
  stripe: Stripe,
  bookingId: string,
  setupIntentId: string,
): Promise<{ setupIntentCancelled: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const si = await stripe.setupIntents.retrieve(setupIntentId);

  if (si.status === "canceled") {
    warnings.push("si_already_canceled");
    return { setupIntentCancelled: true, warnings };
  }

  if (SETUP_INTENT_CANCELABLE_STATUSES.has(si.status)) {
    try {
      await stripe.setupIntents.cancel(
        setupIntentId,
        undefined,
        { idempotencyKey: `cancel-booking:${bookingId}:cancel-si` },
      );
    } catch (err) {
      if (!isRecoverableStripeStateError(err)) throw err;

      const refreshed = await stripe.setupIntents.retrieve(setupIntentId);
      if (refreshed.status !== "canceled") throw err;
      warnings.push("si_cancel_already_applied_verified");
    }
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

  const { stripe, bookingId, paymentInfo, needsRefund, feeApplied, refundAmount, paymentStatus } = input;

  if (needsRefund && paymentInfo?.stripe_payment_intent_id) {
    const piResult = await settlePaymentIntent(
      stripe,
      bookingId,
      paymentInfo.stripe_payment_intent_id,
      feeApplied,
      refundAmount,
      true,
      input.preExistingRefundedCents ?? null,
    );
    stripeRefundId = piResult.stripeRefundId;
    warnings.push(...piResult.warnings);
  } else if (needsRefund) {
    throw new Error("paid_booking_missing_stripe_payment_intent");
  } else if (paymentInfo?.stripe_payment_intent_id) {
    // Defensive: release pre-auth even if DB payment_status is not yet "paid"
    const pi = await stripe.paymentIntents.retrieve(paymentInfo.stripe_payment_intent_id);
    if (pi.status === "requires_capture") {
      const piResult = await settlePaymentIntent(
        stripe,
        bookingId,
        paymentInfo.stripe_payment_intent_id,
        feeApplied,
        refundAmount,
        false,
        input.preExistingRefundedCents ?? null,
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
    const siResult = await cancelSetupIntentIfNeeded(stripe, bookingId, paymentInfo.stripe_setup_intent_id);
    setupIntentCancelled = siResult.setupIntentCancelled;
    warnings.push(...siResult.warnings);
  }

  if (!needsRefund && !paymentInfo?.stripe_payment_intent_id && !paymentInfo?.stripe_setup_intent_id) {
    warnings.push("no_stripe_ids");
  }

  return { stripeRefundId, setupIntentCancelled, warnings };
}

export async function reconcileStripeSettlementAfterError(
  input: StripeSettlementInput,
): Promise<StripeSettlementResult | null> {
  if (input.skipStripe || !input.paymentInfo) return null;

  const warnings = ["stripe_error_reconciled_after_exception"];
  let stripeRefundId: string | null = null;
  let setupIntentCancelled = false;
  const refundCents = Math.round(input.refundAmount * 100);
  const feeCents = Math.round(input.feeApplied * 100);

  if (input.paymentInfo.stripe_payment_intent_id) {
    const pi = await input.stripe.paymentIntents.retrieve(input.paymentInfo.stripe_payment_intent_id);

    if (input.needsRefund) {
      if (pi.status !== "succeeded") return null;
      if (refundCents <= 0) {
        warnings.push("no_refund_needed_verified_after_error");
        return { stripeRefundId, setupIntentCancelled, warnings };
      }

      const { refundedCents, refundId } = await getRefundedAmountForPaymentIntent(input.stripe, pi.id);
      const expectedRefundedCents = (input.preExistingRefundedCents ?? 0) + refundCents;
      if (refundedCents >= expectedRefundedCents) {
        stripeRefundId = refundId;
        warnings.push("refund_applied_verified_after_error");
        return { stripeRefundId, setupIntentCancelled, warnings };
      }
      return null;
    }

    if (feeCents > 0) {
      if (pi.status === "succeeded" && (pi.amount_received ?? 0) >= feeCents) {
        warnings.push("capture_applied_verified_after_error");
        return { stripeRefundId, setupIntentCancelled, warnings };
      }
      return null;
    }

    if (pi.status === "canceled") {
      warnings.push("pi_cancel_applied_verified_after_error");
      return { stripeRefundId, setupIntentCancelled, warnings };
    }
  }

  const shouldReleaseSetup =
    !input.needsRefund &&
    !!input.paymentInfo.stripe_setup_intent_id &&
    SETUP_INTENT_RELEASE_STATUSES.has(input.paymentStatus ?? "");

  if (shouldReleaseSetup && input.paymentInfo.stripe_setup_intent_id) {
    const si = await input.stripe.setupIntents.retrieve(input.paymentInfo.stripe_setup_intent_id);
    if (si.status === "canceled") {
      setupIntentCancelled = true;
      warnings.push("si_cancel_applied_verified_after_error");
      return { stripeRefundId, setupIntentCancelled, warnings };
    }
  }

  return null;
}
