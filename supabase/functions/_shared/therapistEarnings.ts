export type TherapistRates = {
  rate_60: number | null;
  rate_75: number | null;
  rate_90: number | null;
};

/**
 * Fixed therapist earning for a treatment of `totalDurationMinutes`, optionally
 * uplifted by an out-of-hours surcharge percent (e.g. 20 → ×1.2). The surcharge
 * mirrors the venue's `out_of_hours_surcharge_percent` and only applies when the
 * booking is flagged out-of-hours; callers pass 0 (or omit) otherwise.
 */
export function computeTherapistEarnings(
  rates: TherapistRates | null | undefined,
  totalDurationMinutes: number,
  options?: { surchargePercent?: number },
): number | null {
  if (!rates) return null;
  const { rate_60, rate_75, rate_90 } = rates;
  if (totalDurationMinutes <= 0) return null;

  let base: number | null;
  if (totalDurationMinutes === 60) {
    base = rate_60 ?? null;
  } else if (totalDurationMinutes === 75) {
    base = rate_75 ?? null;
  } else if (totalDurationMinutes === 90) {
    base = rate_90 ?? null;
  } else if (totalDurationMinutes < 60) {
    // Pro-rata below 60 min
    base = rate_60 == null ? null : (rate_60 / 60) * totalDurationMinutes;
  } else if (totalDurationMinutes < 75) {
    // Interpolate 60 → 75
    base =
      rate_60 == null || rate_75 == null
        ? null
        : rate_60 + (rate_75 - rate_60) * ((totalDurationMinutes - 60) / (75 - 60));
  } else if (totalDurationMinutes < 90) {
    // Interpolate 75 → 90
    base =
      rate_75 == null || rate_90 == null
        ? null
        : rate_75 + (rate_90 - rate_75) * ((totalDurationMinutes - 75) / (90 - 75));
  } else {
    // Beyond 90 min: extrapolate from rate_90
    base = rate_90 == null ? null : (rate_90 / 90) * totalDurationMinutes;
  }

  if (base == null) return null;
  const factor = 1 + Math.max(0, options?.surchargePercent ?? 0) / 100;
  return Math.round(base * factor * 100) / 100;
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
