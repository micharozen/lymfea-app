// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions compute therapist earnings identically. This is a thin
// re-export kept at the historical @/lib path so existing imports stay stable.
export {
  computeTherapistEarnings,
  hasCompleteRates,
  type TherapistRates,
} from "@shared/therapistEarnings";
