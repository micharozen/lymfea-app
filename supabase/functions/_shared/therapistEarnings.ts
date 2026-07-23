export type TherapistRates = {
  rate_45?: number | null;
  rate_60: number | null;
  rate_75: number | null;
  rate_90: number | null;
  rate_105?: number | null;
  rate_120?: number | null;
  rate_150?: number | null;
};

// Canonical duration brackets (minutes) mapped to their rate column.
const RATE_BRACKETS: ReadonlyArray<{ minutes: number; key: keyof TherapistRates }> = [
  { minutes: 45, key: "rate_45" },
  { minutes: 60, key: "rate_60" },
  { minutes: 75, key: "rate_75" },
  { minutes: 90, key: "rate_90" },
  { minutes: 105, key: "rate_105" },
  { minutes: 120, key: "rate_120" },
  { minutes: 150, key: "rate_150" },
];

/**
 * Fixed therapist earning for a treatment of `totalDurationMinutes`, optionally
 * uplifted by an out-of-hours surcharge percent (e.g. 20 → ×1.2). The surcharge
 * mirrors the venue's `out_of_hours_surcharge_percent` and only applies when the
 * booking is flagged out-of-hours; callers pass 0 (or omit) otherwise.
 *
 * The base amount is derived from the configured rate brackets:
 * - exact bracket match → that bracket's rate,
 * - below the smallest configured bracket → pro-rata from it,
 * - between two configured brackets → linear interpolation,
 * - above the largest configured bracket → pro-rata extrapolation from it.
 */
export function computeTherapistEarnings(
  rates: TherapistRates | null | undefined,
  totalDurationMinutes: number,
  options?: { surchargePercent?: number },
): number | null {
  if (!rates) return null;
  if (totalDurationMinutes <= 0) return null;

  // Only the brackets that actually have a configured rate participate.
  const points = RATE_BRACKETS
    .map(({ minutes, key }) => ({ minutes, rate: rates[key] ?? null }))
    .filter((p): p is { minutes: number; rate: number } => p.rate != null);

  if (points.length === 0) return null;

  const base = interpolateBracketRate(points, totalDurationMinutes);
  if (base == null) return null;

  const factor = 1 + Math.max(0, options?.surchargePercent ?? 0) / 100;
  return Math.round(base * factor * 100) / 100;
}

function interpolateBracketRate(
  points: ReadonlyArray<{ minutes: number; rate: number }>,
  minutes: number,
): number | null {
  const first = points[0];
  const last = points[points.length - 1];

  // Below the smallest configured bracket → pro-rata from it.
  if (minutes <= first.minutes) {
    return (first.rate / first.minutes) * minutes;
  }
  // Above the largest configured bracket → pro-rata extrapolation from it.
  if (minutes >= last.minutes) {
    return (last.rate / last.minutes) * minutes;
  }
  // Between two configured brackets → linear interpolation (or exact match).
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (minutes === lo.minutes) return lo.rate;
    if (minutes < hi.minutes) {
      return lo.rate + (hi.rate - lo.rate) * ((minutes - lo.minutes) / (hi.minutes - lo.minutes));
    }
  }
  return last.rate;
}

export function hasCompleteRates(
  r: TherapistRates | null | undefined,
): boolean {
  return (
    !!r &&
    r.rate_60 != null &&
    r.rate_60 > 0 &&
    r.rate_75 != null &&
    r.rate_75 > 0 &&
    r.rate_90 != null &&
    r.rate_90 > 0
  );
}
