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
  if (totalDurationMinutes <= 45) return rate_45 ?? null;
  if (totalDurationMinutes <= 60) return rate_60 ?? null;
  if (totalDurationMinutes <= 90) return rate_90 ?? null;
  if (rate_90 == null) return null;
  return Math.round((rate_90 / 90) * totalDurationMinutes * 100) / 100;
}
