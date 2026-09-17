/**
 * Shared promo code discount logic — Deno/edge.
 * Mirror of src/lib/promo.ts so the server remains the source of truth.
 */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

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

/**
 * Re-resolve a promo code server-side from its id, revalidating every rule.
 *
 * The client only ever sends an id: the discount type, its value and the
 * eligible treatments are all read back here, so a tampered payload cannot
 * inflate a discount or revive an expired code.
 *
 * Deliberately not going through lookup_promo_code: that RPC burns a
 * rate-limit attempt, which is meant for guest input, not server calls.
 */
export async function fetchPromoCodeById(
  supabase: SupabaseClient,
  promoCodeId: string | null | undefined,
  hotelId: string,
  /** Identité du client, pour le plafond par client. Le tunnel étant public,
   *  un client est reconnu par son téléphone ou son email. */
  customer?: { phone?: string | null; email?: string | null },
): Promise<PromoCode | null> {
  if (!promoCodeId) return null;

  const { data: promo, error } = await supabase
    .from("promo_codes")
    .select(
      "id, code, discount_type, discount_value, hotel_id, organization_id, is_active, valid_from, valid_until, max_redemptions, max_per_customer, redemption_count",
    )
    .eq("id", promoCodeId)
    .maybeSingle();

  if (error || !promo) return null;

  const { data: hotel } = await supabase
    .from("hotels")
    .select("organization_id")
    .eq("id", hotelId)
    .maybeSingle();

  if (!hotel || promo.organization_id !== hotel.organization_id) return null;
  if (promo.hotel_id !== null && promo.hotel_id !== hotelId) return null;
  if (!promo.is_active) return null;

  const now = Date.now();
  if (promo.valid_from && now < new Date(promo.valid_from).getTime()) return null;
  if (promo.valid_until && now > new Date(promo.valid_until).getTime()) return null;
  if (promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions) {
    return null;
  }

  // Plafond par client. Sans identité transmise, on laisse passer ici :
  // redeem_promo_code revérifie avec le customer_id réel avant de consommer.
  if (promo.max_per_customer !== null && (customer?.phone || customer?.email)) {
    const { data: used } = await supabase.rpc("promo_customer_usage_count", {
      _promo_code_id: promo.id,
      _org_id: promo.organization_id,
      _phone: customer.phone ?? null,
      _email: customer.email ?? null,
    });
    if ((Number(used) || 0) >= promo.max_per_customer) return null;
  }

  const { data: rows } = await supabase
    .from("promo_code_treatments")
    .select("treatment_id")
    .eq("promo_code_id", promo.id);

  return {
    id: promo.id,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: Number(promo.discount_value) || 0,
    eligible_treatment_ids: (rows || []).map((r: { treatment_id: string }) => r.treatment_id),
  };
}

/** Label suffix shown on the Stripe Checkout line so the guest sees the discount. */
export function promoLabelSuffix(
  promo: PromoCode | null,
  discount: number,
  currency: string,
): string {
  if (!promo || discount <= 0) return "";
  const symbol = currency.toLowerCase() === "eur" ? "€" : currency.toUpperCase();
  // Le montant peut porter des centimes (25 % de 177 € = 44,25 €) : virgule
  // décimale, sans décimale superflue sur un compte rond.
  const amount = (Math.round(discount * 100) % 100 === 0
    ? String(Math.round(discount))
    : discount.toFixed(2).replace(".", ","));
  return ` (code ${promo.code} : -${amount} ${symbol})`;
}
