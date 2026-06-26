// Single source of truth for resolving a booking line's price across edge functions.
// Precedence: admin override > variant price > menu price > 0.
// Mirror of the frontend resolver in src/lib/bookingCartLine.ts — keep both in sync.

export type TreatmentPriceRow = {
  price_override?: number | null;
  treatment_variants?: { price?: number | null } | null;
  treatment_menus?: { price?: number | null } | null;
};

export function resolveTreatmentPrice(row: TreatmentPriceRow): number {
  if (row.price_override !== null && row.price_override !== undefined) {
    return row.price_override;
  }
  return row.treatment_variants?.price ?? row.treatment_menus?.price ?? 0;
}
