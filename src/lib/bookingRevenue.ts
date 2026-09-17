// Single source of truth lives in the Deno-shared module so the frontend, the
// closure email and the invoicing edge functions decide identically which
// bookings count as revenue. This is a thin re-export.
export {
  NO_SHOW_STATUSES,
  BILLED_PAYMENT_STATUSES,
  isNoShowStatus,
  isBilledNoShow,
  countsAsRevenue,
  bookingBilledAmount,
  noShowFeeFrom,
  type RevenueBooking,
  type PaymentInfoEmbed,
} from "@shared/bookingRevenue";
