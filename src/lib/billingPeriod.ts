/**
 * Périodes de facturation, manipulées uniquement en dates nues (`YYYY-MM-DD`).
 *
 * Ne jamais convertir ces chaînes via `new Date(iso)` sans suffixe explicite :
 * le parseur les interprète en UTC et décale la date d'un jour selon le fuseau.
 */

export interface DateRange {
  start: string;
  end: string;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Date locale → `YYYY-MM-DD`, sans passage par UTC. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Mois complet décalé de `offset` mois par rapport à la référence. */
const monthRange = (offset: number, ref: Date = new Date()): DateRange => {
  const start = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + offset + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
};

export const currentMonthRange = (ref?: Date): DateRange => monthRange(0, ref);
export const previousMonthRange = (ref?: Date): DateRange => monthRange(-1, ref);
export const nextMonthRange = (ref?: Date): DateRange => monthRange(1, ref);

/** Horodatage ISO → `18/08/26 à 14:32`. */
export const formatDateTimeFr = (iso: string): string => {
  const d = new Date(iso);
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  return `${date} à ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** `2026-08-01` + `2026-08-31` → `01/08/2026 → 31/08/2026`. */
export const formatPeriodFr = (start: string, end: string): string => {
  const format = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${format(start)} → ${format(end)}`;
};

/**
 * Libellé lisible d'une période : un mois entier s'affiche « Août 2026 »,
 * toute autre plage montre ses bornes.
 */
export const formatPeriodLabelFr = (start: string, end: string): string => {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const lastDayOfEndMonth = new Date(ey, em, 0).getDate();

  if (sd === 1 && sy === ey && sm === em && ed === lastDayOfEndMonth) {
    const label = new Date(sy, sm - 1, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return formatPeriodFr(start, end);
};
