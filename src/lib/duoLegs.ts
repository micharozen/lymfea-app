// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions split duo legs identically. Thin re-export at @/lib.
export {
  computeDuoLegs,
  type DuoLeg,
  type DuoLegTreatment,
} from "@shared/duoLegs";
