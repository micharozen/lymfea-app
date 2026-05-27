/**
 * Client cancellation tier resolution (refund % by hours before appointment).
 * Keep in sync with supabase/functions/_shared/cancellation-tiers.ts
 */

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
  needsRefund: boolean,
  hasPaymentIntentHold: boolean,
  isNonStripeSettlement: boolean,
): boolean {
  if (isNonStripeSettlement) return false;
  return needsRefund || hasPaymentIntentHold;
}

export function validateCancellationTiers(tiers: CancellationTier[]): string | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => b.max_hours - a.max_hours);
  for (const tier of sorted) {
    if (tier.min_hours < 0) return "min_hours must be >= 0";
    if (tier.max_hours <= tier.min_hours) return "max_hours must be greater than min_hours";
    if (tier.refund_percent < 0 || tier.refund_percent > 100) {
      return "refund_percent must be between 0 and 100";
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.min_hours < next.max_hours) {
      return "tiers must not overlap";
    }
  }
  return null;
}

export function hoursUntilBooking(
  bookingDate: string,
  bookingTime: string,
  timezone = "UTC",
): number | null {
  if (!bookingDate || !bookingTime) return null;
  const [year, month, day] = bookingDate.split("-").map(Number);
  const [hour, minute, second = 0] = bookingTime.split(":").map(Number);
  if ([year, month, day, hour, minute, second].some((v) => Number.isNaN(v))) {
    return null;
  }
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(localAsUtc)).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asIfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const timezoneOffsetMs = asIfLocal - localAsUtc;
  const bookingMs = localAsUtc - timezoneOffsetMs;
  return (bookingMs - Date.now()) / (1000 * 60 * 60);
}
