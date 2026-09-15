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

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/** Une ligne de panier avec son prix catalogue résolu, quantité comprise. */
export interface PricedCatalogLine {
  treatmentId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Résout le prix de chaque ligne du panier depuis la base, jamais depuis ce que
 * le client a envoyé.
 *
 * `computePricing` ci-dessus suppose que l'appelant a déjà chargé les soins et
 * les variantes (cas des actions Stripe). `create-client-booking` ne les charge
 * pas — il ne reçoit qu'un total — d'où cette variante qui fait elle-même les
 * lectures, et qui porte la quantité ligne à ligne dont a besoin l'assiette
 * d'un code promo.
 *
 * Les lignes dont le soin est absent du catalogue sont ignorées : on calcule
 * une assiette de remise, pas une validation de panier (voir
 * `validateTreatments` pour cela).
 */
export async function resolveCatalogLines(
  supabase: SupabaseClient,
  lines: ReadonlyArray<TreatmentPayloadItem & { quantity?: number | string | null }>,
): Promise<PricedCatalogLine[]> {
  const treatmentIds = [
    ...new Set((lines || []).map((l) => l.treatmentId || l.id).filter(Boolean)),
  ] as string[];
  if (treatmentIds.length === 0) return [];

  const { data: treatments } = await supabase
    .from("treatment_menus")
    .select("id, price")
    .in("id", treatmentIds);

  const priceById = new Map<string, number>(
    (treatments || []).map((t: { id: string; price: number | null }) => [t.id, t.price ?? 0]),
  );

  const variantIds = [
    ...new Set((lines || []).map((l) => l.variantId).filter(Boolean)),
  ] as string[];

  const variantPriceById = new Map<string, number | null>();
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("treatment_variants")
      .select("id, price")
      .in("id", variantIds);
    for (const v of (variants || []) as VariantRow[]) {
      variantPriceById.set(v.id, v.price);
    }
  }

  const priced: PricedCatalogLine[] = [];
  for (const line of lines || []) {
    const treatmentId = line.treatmentId || line.id;
    if (!treatmentId || !priceById.has(treatmentId)) continue;

    const quantity = Math.max(1, Number(line.quantity) || 1);
    // La variante prime sur le soin, même règle que confirm-setup-intent.
    const unitPrice = (line.variantId ? variantPriceById.get(line.variantId) : null) ??
      priceById.get(treatmentId) ?? 0;

    priced.push({
      treatmentId,
      variantId: line.variantId ?? null,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    });
  }
  return priced;
}
