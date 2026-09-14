// Single source of truth lives in the Deno-shared module so the closure email
// (edge function) and the on-screen/PDF report split a booking between its
// therapists identically. Thin re-export at @/lib.
export {
  splitBookingByTherapist,
  orderRoster,
  type SplitLine,
  type SplitPart,
  type SplitBookingInput,
} from "@shared/closureTherapistSplit";
