// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions compute therapist earnings identically. This is a thin
// re-export kept at the historical @/lib path so existing imports stay stable.
export {
  computeTherapistEarnings,
  computeLegEarnings,
  computeLegEarningsDetailed,
  hasCompleteRates,
  type TherapistRates,
  type TreatmentRateMap,
  type EarningLine,
  type LegEarningsInput,
} from "@shared/therapistEarnings";
