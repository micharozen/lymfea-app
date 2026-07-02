/**
 * Client cancellation tier resolution (refund % by hours before appointment).
 * Keep in sync with src/lib/cancellationTiers.ts
 */

import { venueLocalToUtc } from "./venue-time.ts";

export type CancellationTier = {
  max_hours: number;
  min_hours: number;
  refund_percent: number;
};

export type ResolveRefundPercentResult =
  | { status: "blocked" }
  | { status: "ok"; refund_percent: number };

export function parseCancellationTiers(raw: unknown): CancellationTier[] {
  if (!Array.isArray(raw)) return [];
  const tiers: CancellationTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const max_hours = Number(row.max_hours);
    const min_hours = Number(row.min_hours);
    const refund_percent = Number(row.refund_percent);
    if (
      Number.isFinite(max_hours) &&
      Number.isFinite(min_hours) &&
      Number.isFinite(refund_percent) &&
      min_hours >= 0 &&
      max_hours > min_hours &&
      refund_percent >= 0 &&
      refund_percent <= 100
    ) {
      tiers.push({ max_hours, min_hours, refund_percent });
    }
  }
  return tiers.sort((a, b) => b.max_hours - a.max_hours);
}

export function resolveRefundPercent(
  hoursUntil: number,
  tiers: CancellationTier[],
  cutoffHours: number,
): ResolveRefundPercentResult {
  const cutoff = Number.isFinite(cutoffHours) && cutoffHours >= 0 ? cutoffHours : 2;
  if (hoursUntil <= cutoff) {
    return { status: "blocked" };
  }
  const parsed = parseCancellationTiers(tiers);
  for (const tier of parsed) {
    if (hoursUntil > tier.min_hours && hoursUntil <= tier.max_hours) {
      return { status: "ok", refund_percent: tier.refund_percent };
    }
  }
  return { status: "ok", refund_percent: 100 };
}

export function amountsFromRefundPercent(
  depositAmount: number,
  refundPercent: number,
): { feeApplied: number; refundAmount: number } {
  const deposit = Math.max(0, Number(depositAmount) || 0);
  const pct = Math.min(100, Math.max(0, Number(refundPercent) || 0));
  const refundAmount = Math.round(deposit * (pct / 100) * 100) / 100;
  const feeApplied = Math.round((deposit - refundAmount) * 100) / 100;
  return { feeApplied, refundAmount };
}

/** True when client tier % can result in a real Stripe capture/refund. */
export function canApplyClientTierFinancials(
  needsStripe: boolean,
  skipStripe: boolean,
  paymentIntentStatus: string | null | undefined,
): boolean {
  if (skipStripe) return false;
  if (needsStripe) return true;
  return paymentIntentStatus === "requires_capture";
}

export function hoursUntilBooking(
  bookingDate: string,
  bookingTime: string,
  timezone = "UTC",
): number | null {
  const bookingDateUtc = venueLocalToUtc(bookingDate, bookingTime, timezone);
  if (!bookingDateUtc) return null;
  return (bookingDateUtc.getTime() - Date.now()) / (1000 * 60 * 60);
}
