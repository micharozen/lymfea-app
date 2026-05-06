/**
 * Shared pricing + treatment validation logic for Stripe payment handlers.
 *
 * Extracted from stripe-payment/actions/createSetupIntent.ts so the same
 * logic can be reused by other handlers (finalizePayment, chargeSavedCard,
 * sendPaymentLink…) and unit-tested independently of Stripe / Supabase I/O.
 */

export interface TreatmentRow {
  id: string;
  hotel_id: string | null;
  status: string | null;
  price: number | null;
  duration: number | null;
}

export interface VariantRow {
  id: string;
  price: number | null;
  duration: number | null;
}

export interface TreatmentPayloadItem {
  treatmentId?: string;
  id?: string;
  variantId?: string;
}

export interface GiftAmountUsage {
  customerBundleId?: string;
  amountCents?: number;
}

export const ACTIVE_STATUSES: ReadonlyArray<string> = [
  "Actif",
  "active",
  "Active",
];

export interface ValidationFailure {
  code:
    | "MISSING_TREATMENTS"
    | "OUTDATED_CART"
    | "INACTIVE_OR_FOREIGN"
    | "MISSING_VARIANT";
  message: string;
}

/**
 * Validate that every payload treatment exists, belongs to the venue, is
 * active, and that any requested variant exists. Returns null when valid.
 */
export function validateTreatments(
  payload: ReadonlyArray<TreatmentPayloadItem>,
  treatments: ReadonlyArray<TreatmentRow>,
  variants: ReadonlyArray<VariantRow>,
  hotelId: string,
): ValidationFailure | null {
  const effectiveIds = payload
    .map((t) => t.treatmentId || t.id)
    .filter((id): id is string => Boolean(id));

  if (effectiveIds.length === 0) {
    return {
      code: "MISSING_TREATMENTS",
      message: "At least one treatment is required",
    };
  }

  const found = new Set(treatments.map((t) => t.id));
  const missing = effectiveIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return {
      code: "OUTDATED_CART",
      message:
        "Some treatments are no longer available in our catalog. Please refresh your cart.",
    };
  }

  const invalid = treatments.filter(
    (t) =>
      (t.hotel_id !== null && t.hotel_id !== hotelId) ||
      !ACTIVE_STATUSES.includes(t.status ?? ""),
  );
  if (invalid.length > 0) {
    return {
      code: "INACTIVE_OR_FOREIGN",
      message:
        "Some selected treatments are currently inactive or unavailable for this venue.",
    };
  }

  const variantIds = new Set(variants.map((v) => v.id));
  for (const item of payload) {
    if (item.variantId && !variantIds.has(item.variantId)) {
      return {
        code: "MISSING_VARIANT",
        message: "A requested treatment variant is no longer available.",
      };
    }
  }

  return null;
}

export interface PricingResult {
  rawTotalPrice: number;
  totalDuration: number;
  giftDeductionEuros: number;
  verifiedTotalPrice: number;
}

/**
 * Compute the raw price + duration of a cart, then apply any gift card
 * deduction. Default duration is 30 minutes when neither the variant nor
 * the base treatment specify one (matches the prior inline behaviour).
 */
export function computePricing(
  payload: ReadonlyArray<TreatmentPayloadItem>,
  treatments: ReadonlyArray<TreatmentRow>,
  variants: ReadonlyArray<VariantRow>,
  giftAmountUsage?: GiftAmountUsage | null,
): PricingResult {
  let rawTotalPrice = 0;
  let totalDuration = 0;

  for (const item of payload) {
    const tid = item.treatmentId || item.id;
    if (!tid) continue;
    const baseTreatment = treatments.find((t) => t.id === tid);
    if (!baseTreatment) continue;

    if (item.variantId) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) continue;
      rawTotalPrice += variant.price ?? baseTreatment.price ?? 0;
      totalDuration += variant.duration ?? baseTreatment.duration ?? 30;
    } else {
      rawTotalPrice += baseTreatment.price ?? 0;
      totalDuration += baseTreatment.duration ?? 30;
    }
  }

  const giftDeductionEuros = giftAmountUsage?.amountCents
    ? Math.round(giftAmountUsage.amountCents / 100)
    : 0;

  const verifiedTotalPrice = Math.max(rawTotalPrice - giftDeductionEuros, 0);

  return {
    rawTotalPrice,
    totalDuration,
    giftDeductionEuros,
    verifiedTotalPrice,
  };
}
