/** Minute options for staff booking creation (admin / concierge). */
export const STAFF_BOOKING_MINUTES = Array.from({ length: 12 }, (_, i) =>
  (i * 5).toString().padStart(2, "0"),
);

/** Legacy 10-minute grid used when staff override is off. */
export const LEGACY_BOOKING_MINUTES = ["00", "10", "20", "30", "40", "50"];
