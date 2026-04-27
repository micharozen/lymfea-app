export type TherapistRates = {
  rate_45: number | null;
  rate_60: number | null;
  rate_90: number | null;
};

export function computeTherapistEarnings(
  rates: TherapistRates | null | undefined,
  totalDurationMinutes: number,
): number | null {
  if (!rates) return null;
  const { rate_45, rate_60, rate_90 } = rates;
  if (totalDurationMinutes <= 0) return null;

  if (totalDurationMinutes === 45) return rate_45 ?? null;
  if (totalDurationMinutes === 60) return rate_60 ?? null;
  if (totalDurationMinutes === 90) return rate_90 ?? null;

  if (totalDurationMinutes < 45) {
    if (rate_45 == null) return null;
    return Math.round((rate_45 / 45) * totalDurationMinutes * 100) / 100;
  }
  if (totalDurationMinutes < 60) {
    if (rate_45 == null || rate_60 == null) return null;
    const ratio = (totalDurationMinutes - 45) / (60 - 45);
    return Math.round((rate_45 + (rate_60 - rate_45) * ratio) * 100) / 100;
  }
  if (totalDurationMinutes < 90) {
    if (rate_60 == null || rate_90 == null) return null;
    const ratio = (totalDurationMinutes - 60) / (90 - 60);
    return Math.round((rate_60 + (rate_90 - rate_60) * ratio) * 100) / 100;
  }
  if (rate_90 == null) return null;
  return Math.round((rate_90 / 90) * totalDurationMinutes * 100) / 100;
}
