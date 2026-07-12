// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions attribute therapist legs identically. Thin re-export at @/lib.
export {
  myLegDuration,
  estimateTherapistShare,
  type LegTreatment,
  type EstimateTherapistShareInput,
} from "@shared/therapistLegDuration";
