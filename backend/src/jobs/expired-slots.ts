import { supabaseAdmin } from "../lib/supabase";

/**
 * Cron job: Check and cancel expired pre-reservation slots.
 *
 * Migrated from: supabase/functions/check-expired-slots/index.ts
 * Previously triggered by pg_cron. Now runs as a Railway Cron Job
 * or via a simple setInterval in the backend process.
 *
 * Recommended Railway Cron schedule: every 2 minutes
 */
export async function checkExpiredSlots() {
  console.log("[cron] Checking expired pre-reservation slots...");

  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();

  // Find pre-reserved bookings older than 4 minutes that haven't been paid
  const { data: expiredBookings, error } = await supabaseAdmin
    .from("bookings")
    .select("id, booking_id")
    .eq("status", "pre-reserved")
    .eq("payment_status", "awaiting_payment")
    .lt("created_at", fourMinutesAgo);

  if (error) {
    console.error("[cron] Error fetching expired slots:", error);
    return;
  }

  if (!expiredBookings || expiredBookings.length === 0) {
    console.log("[cron] No expired slots found");
    return;
  }

  console.log(`[cron] Found ${expiredBookings.length} expired pre-reservations`);

  for (const booking of expiredBookings) {
    const { error: cancelError } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        payment_status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    if (cancelError) {
      console.error(
        `[cron] Failed to cancel booking ${booking.booking_id}:`,
        cancelError
      );
    } else {
      console.log(`[cron] Cancelled expired pre-reservation: ${booking.booking_id}`);
    }
  }
}

/**
 * Start the cron job as a simple interval.
 * Alternative: use Railway Cron Jobs for better reliability.
 */
export function startExpiredSlotsJob(intervalMs = 2 * 60 * 1000) {
  console.log(`[cron] Expired slots check running every ${intervalMs / 1000}s`);
  setInterval(checkExpiredSlots, intervalMs);
  // Run immediately on startup
  checkExpiredSlots();
}
