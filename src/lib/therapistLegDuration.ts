// Single source of truth lives in the Deno-shared module so the frontend and the
// Supabase edge functions attribute therapist legs identically. Thin re-export at @/lib.
export {
  myLegDuration,
  myLegTreatments,
  bookingSlotDuration,
  estimateTherapistShare,
  scheduleTreatments,
  legWindowForLines,
  displayLegTreatments,
  orderTreatments,
  addMinutesToClock,
  type LegTreatment,
  type ScheduledTreatment,
  type ScheduledBlock,
  type LegWindow,
  type EstimateTherapistShareInput,
} from "@shared/therapistLegDuration";
