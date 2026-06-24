export type TherapistRates = {
  rate_60: number | null;
  rate_75: number | null;
  rate_90: number | null;
};

export function computeTherapistEarnings(
  rates: TherapistRates | null | undefined,
  totalDurationMinutes: number,
): number | null {
  if (!rates) return null;
  const { rate_60, rate_75, rate_90 } = rates;
  if (totalDurationMinutes <= 0) return null;

  // Exact bracket boundaries
  if (totalDurationMinutes === 60) return rate_60 ?? null;
  if (totalDurationMinutes === 75) return rate_75 ?? null;
  if (totalDurationMinutes === 90) return rate_90 ?? null;

  // Pro-rata interpolation between brackets
  if (totalDurationMinutes < 60) {
    if (rate_60 == null) return null;
    return Math.round((rate_60 / 60) * totalDurationMinutes * 100) / 100;
  }
  if (totalDurationMinutes < 75) {
    if (rate_60 == null || rate_75 == null) return null;
    const ratio = (totalDurationMinutes - 60) / (75 - 60);
    return Math.round((rate_60 + (rate_75 - rate_60) * ratio) * 100) / 100;
  }
  if (totalDurationMinutes < 90) {
    if (rate_75 == null || rate_90 == null) return null;
    const ratio = (totalDurationMinutes - 75) / (90 - 75);
    return Math.round((rate_75 + (rate_90 - rate_75) * ratio) * 100) / 100;
  }
  // Beyond 90 min: extrapolate from rate_90
  if (rate_90 == null) return null;
  return Math.round((rate_90 / 90) * totalDurationMinutes * 100) / 100;
}
