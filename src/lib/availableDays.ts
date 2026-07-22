/**
 * Days a bookable line is allowed on: 0=Sun, 1=Mon, …, 6=Sat.
 *
 * A variant can carry its own days (e.g. a "Semaine" and a "Week-end" formula
 * priced differently on the same treatment); when it does, they win over the
 * treatment's. Both empty/null = no constraint, every day.
 */
export function resolveAvailableDays(
  treatmentDays: number[] | null | undefined,
  variantDays: number[] | null | undefined,
): number[] | null {
  if (variantDays && variantDays.length > 0) return variantDays;
  return treatmentDays ?? null;
}
