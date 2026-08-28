// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions resolve a booking line's price identically.
// Thin re-export at @/lib.
export { resolveTreatmentPrice, type TreatmentPriceRow } from "@shared/treatmentPrice";
