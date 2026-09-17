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
  /** Discount in currency units, rounded to the cent, never above eligibleBase. */
  discount: number;
}

/**
 * Arrondit un montant en unités monétaires au centime le plus proche.
 *
 * Une remise en pourcentage produit presque toujours des centimes : sans cet
 * arrondi, la soustraction en flottant laisse des traînées (132.75000000000003)
 * dans total_price.
 */
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
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

  // Tout le calcul passe par les centimes : un pourcentage tombe rarement juste
  // (25 % de 177 € = 44,25 €) et arrondir à l'euro déplaçait jusqu'à 50 ct.
  const eligibleBaseCents = lines.reduce(
    (sum, line) =>
      targetsEverything || eligibleIds.has(line.treatmentId)
        ? sum + Math.round((Number(line.lineTotal) || 0) * 100)
        : sum,
    0,
  );

  if (eligibleBaseCents <= 0) return { eligibleBase: 0, discount: 0 };

  const value = Number(promo.discount_value) || 0;
  const discountCents = promo.discount_type === "percentage"
    ? Math.round((eligibleBaseCents * value) / 100)
    : Math.min(Math.round(value * 100), eligibleBaseCents);

  return {
    eligibleBase: eligibleBaseCents / 100,
    discount: Math.max(0, discountCents) / 100,
  };
}
