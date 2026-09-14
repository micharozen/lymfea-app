// NOTE: mirror of supabase/functions/_shared/therapistEarnings.ts. The backend
// build is isolated (tsconfig rootDir: ./src) and cannot import outside its own
// src/, so this copy is kept in sync by hand. Keep the two implementations equal.
export type TherapistRates = {
  rate_30?: number | null;
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
  { minutes: 30, key: "rate_30" },
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

/**
 * Barèmes spécifiques à certains soins, par thérapeute (`therapists.treatment_rates`).
 * Clé externe : `treatment_menus.id`. Clé interne : la durée en minutes.
 * Le flag `treatment_rates_active` est honoré à la lecture — un appelant qui charge
 * un thérapeute inactif passe `null` ici, jamais la map.
 */
export type TreatmentRateMap = Record<string, Record<string, number>>;

export interface EarningLine {
  treatment_id?: string | null;
  duration: number | null;
}

export interface LegEarningsInput {
  /** Minutes payées au thérapeute — la valeur déjà calculée par l'appelant. */
  totalDuration: number;
  /** Lignes de la jambe, pour repérer celles qui ont un barème propre. */
  lines?: EarningLine[];
}

/**
 * Gain d'une jambe, en tenant compte des barèmes spécifiques par soin.
 *
 * Les lignes dont le soin a son propre barème sont sorties du lot et payées une par
 * une sur ce barème seul ; leurs minutes sont retirées de `totalDuration`, et le
 * reste est payé au barème par défaut exactement comme avant. Sans barème
 * spécifique applicable, le résultat est donc strictement celui de
 * `computeTherapistEarnings(rates, totalDuration, options)` — y compris là où
 * `totalDuration` ne vaut pas la somme des lignes (`bookings.duration` en clôture).
 *
 * `usedTreatmentRate` sert au badge « Taux spécifique » du récap admin.
 */
export function computeLegEarningsDetailed(
  rates: TherapistRates | null | undefined,
  treatmentRates: TreatmentRateMap | null | undefined,
  leg: LegEarningsInput,
  options?: { surchargePercent?: number },
): { amount: number | null; usedTreatmentRate: boolean } {
  const { totalDuration, lines } = leg;

  let overrideBase = 0;
  let overrideMinutes = 0;
  let usedTreatmentRate = false;

  if (treatmentRates && lines) {
    for (const line of lines) {
      const minutes = line.duration || 0;
      if (minutes <= 0 || !line.treatment_id) continue;

      const points = treatmentRatePoints(treatmentRates[line.treatment_id]);
      if (points.length === 0) continue;

      const base = interpolateBracketRate(points, minutes);
      if (base == null) continue;

      overrideBase += base;
      overrideMinutes += minutes;
      usedTreatmentRate = true;
    }
  }

  if (!usedTreatmentRate) {
    return {
      amount: computeTherapistEarnings(rates, totalDuration, options),
      usedTreatmentRate: false,
    };
  }

  // Le reste peut être nul (toute la jambe est surchargée) : le barème par défaut
  // n'est alors pas requis, ce qui permet de payer un thérapeute qui n'a QUE des
  // barèmes par soin. Un reste négatif ne peut venir que d'un `totalDuration`
  // incohérent avec les lignes — on le neutralise plutôt que de payer en négatif.
  const remaining = Math.max(0, totalDuration - overrideMinutes);
  let base = overrideBase;

  if (remaining > 0) {
    const rest = computeTherapistEarnings(rates, remaining);
    if (rest == null) return { amount: null, usedTreatmentRate };
    base += rest;
  }

  const factor = 1 + Math.max(0, options?.surchargePercent ?? 0) / 100;
  return { amount: Math.round(base * factor * 100) / 100, usedTreatmentRate };
}

/** Emballage scalaire de `computeLegEarningsDetailed`, pour les appelants sans badge. */
export function computeLegEarnings(
  rates: TherapistRates | null | undefined,
  treatmentRates: TreatmentRateMap | null | undefined,
  leg: LegEarningsInput,
  options?: { surchargePercent?: number },
): number | null {
  return computeLegEarningsDetailed(rates, treatmentRates, leg, options).amount;
}

/**
 * Paliers exploitables d'un barème de soin, triés par durée croissante —
 * `interpolateBracketRate` suppose l'ordre. Les valeurs nulles ou négatives sont
 * ignorées : un barème vidé dans l'UI doit se comporter comme une absence de
 * barème, pas comme un tarif à 0 €.
 */
function treatmentRatePoints(
  scale: Record<string, number> | undefined,
): Array<{ minutes: number; rate: number }> {
  if (!scale) return [];

  return Object.entries(scale)
    .map(([minutes, rate]) => ({ minutes: Number(minutes), rate: Number(rate) }))
    .filter((p) => Number.isFinite(p.minutes) && p.minutes > 0 && Number.isFinite(p.rate) && p.rate > 0)
    .sort((a, b) => a.minutes - b.minutes);
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
