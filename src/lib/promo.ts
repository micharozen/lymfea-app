/**
 * Promo code discount — client-side display only.
 * Mirror of supabase/functions/_shared/promo.ts. The server recomputes and
 * persists the discount — this is for display only.
 */

export interface PromoCode {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  /** Empty = every cart line is eligible. */
  eligible_treatment_ids: string[];
}

/** A priced cart line. `lineTotal` already accounts for quantity. */
export interface PricedLine {
  treatmentId: string;
  lineTotal: number;
}

export interface PromoDiscountResult {
  /** Sum of the eligible lines the discount applies to. */
  eligibleBase: number;
  /** Discount in currency units, never above eligibleBase. */
  discount: number;
}

/**
 * Compute the discount a promo code grants on a cart.
 *
 * The discount only ever applies to the lines the code targets: a "-20% on
 * massages" code leaves the rest of the cart at full price. An empty
 * eligible_treatment_ids means the code targets everything.
 *
 * A valid code on a cart with no eligible line yields a zero discount rather
 * than an error — the caller decides how to tell the guest.
 */
export function computePromoDiscount(
  lines: PricedLine[],
  promo: PromoCode | null | undefined,
): PromoDiscountResult {
  if (!promo) return { eligibleBase: 0, discount: 0 };

  const targetsEverything = !promo.eligible_treatment_ids?.length;
  const eligibleIds = new Set(promo.eligible_treatment_ids || []);

  const eligibleBase = lines.reduce(
    (sum, line) =>
      targetsEverything || eligibleIds.has(line.treatmentId)
        ? sum + (Number(line.lineTotal) || 0)
        : sum,
    0,
  );

  if (eligibleBase <= 0) return { eligibleBase: 0, discount: 0 };

  const value = Number(promo.discount_value) || 0;
  const discount = promo.discount_type === "percentage"
    ? Math.round((eligibleBase * value) / 100)
    : Math.min(Math.round(value), eligibleBase);

  return { eligibleBase, discount: Math.max(0, discount) };
}
