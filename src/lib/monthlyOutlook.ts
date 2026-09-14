import { addMonths, format, startOfMonth, subMonths } from "date-fns";

export const OUTLOOK_PAST_MONTHS = 6;
export const OUTLOOK_FUTURE_MONTHS = 3;

export interface MonthlyOutlookPoint {
  monthKey: string; // "2026-07" — label localisé calculé dans le composant
  isCurrent: boolean;
  isFuture: boolean;
  confirmedRevenue: number; // EUR
  pendingRevenue: number; // EUR
  confirmedCount: number;
  pendingCount: number;
  totalRevenue: number;
  totalCount: number;
  averageBasket: number;
}

interface OutlookBooking {
  booking_date: string;
  status: string;
  total_price: number | null;
  hotel_id: string;
}

const EXCLUDED_STATUSES = new Set(["cancelled", "noshow"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Agrégats serveur ────────────────────────────────────────────────
//
// La RPC get_dashboard_monthly_outlook fait en SQL le regroupement que les
// deux builders ci-dessous faisaient ligne à ligne. Le regroupement par lieu
// est ce qui rend l'agrégation exacte : la conversion EUR étant un facteur
// par devise de lieu, convertir la somme du groupe équivaut à sommer les
// conversions individuelles.

/** Une ligne d'agrégat : un (mois × lieu × confirmé|en attente). */
export interface OutlookAggregate {
  monthKey: string;
  hotelId: string;
  bucket: "pending" | "confirmed";
  /** Montant dans la devise du lieu. */
  revenue: number;
  bookingCount: number;
}

interface AggregateOpts {
  toEUR: (price: number | null, hotelId: string) => number;
  now?: Date;
}

/** Grille de mois de la fenêtre, dans l'ordre, du plus ancien au plus lointain. */
function outlookMonths(now: Date | undefined): Array<{
  monthKey: string;
  isCurrent: boolean;
  isFuture: boolean;
}> {
  const current = startOfMonth(now ?? new Date());
  const months = [];
  for (let i = -OUTLOOK_PAST_MONTHS; i <= OUTLOOK_FUTURE_MONTHS; i++) {
    const month = i < 0 ? subMonths(current, -i) : addMonths(current, i);
    months.push({
      monthKey: format(month, "yyyy-MM"),
      isCurrent: i === 0,
      isFuture: i > 0,
    });
  }
  return months;
}

// ── Décomposition par lieu (une série par lieu sur la même fenêtre) ──

export interface VenueMonthlyValues {
  revenue: number; // EUR (confirmé + en attente)
  count: number;
  averageBasket: number;
}

export interface MonthlyOutlookByVenueMonth {
  monthKey: string;
  isCurrent: boolean;
  isFuture: boolean;
  byVenue: Record<string, VenueMonthlyValues>; // clé = hotel_id
}

export interface MonthlyOutlookByVenue {
  // Lieux présents sur la fenêtre (≥ 1 résa), triés par CA total décroissant
  // pour des couleurs et un ordre de légende stables.
  venues: Array<{ id: string; name: string }>;
  months: MonthlyOutlookByVenueMonth[];
}

/**
 * Même fenêtre que buildMonthlyOutlook mais décomposée par lieu : une série de
 * valeurs (CA / nombre / panier moyen) par hotel_id et par mois.
 */
export function buildMonthlyOutlookByVenue(
  bookings: readonly OutlookBooking[],
  opts: {
    venues: ReadonlyArray<{ id: string; name: string }>;
    toEUR: (price: number | null, hotelId: string) => number;
    now?: Date;
  },
): MonthlyOutlookByVenue {
  const current = startOfMonth(opts.now ?? new Date());

  const months: MonthlyOutlookByVenueMonth[] = [];
  const byMonth = new Map<string, MonthlyOutlookByVenueMonth>();
  for (let i = -OUTLOOK_PAST_MONTHS; i <= OUTLOOK_FUTURE_MONTHS; i++) {
    const month = i < 0 ? subMonths(current, -i) : addMonths(current, i);
    const monthKey = format(month, "yyyy-MM");
    const entry: MonthlyOutlookByVenueMonth = {
      monthKey,
      isCurrent: i === 0,
      isFuture: i > 0,
      byVenue: {},
    };
    months.push(entry);
    byMonth.set(monthKey, entry);
  }

  const venueTotals = new Map<string, number>(); // hotel_id → CA total (pour tri)
  for (const booking of bookings) {
    if (EXCLUDED_STATUSES.has(booking.status)) continue;
    const monthKey = booking.booking_date?.slice(0, 7);
    const month = monthKey ? byMonth.get(monthKey) : undefined;
    if (!month) continue;

    const amount = opts.toEUR(booking.total_price, booking.hotel_id);
    const cell = month.byVenue[booking.hotel_id] ?? { revenue: 0, count: 0, averageBasket: 0 };
    cell.revenue += amount;
    cell.count += 1;
    month.byVenue[booking.hotel_id] = cell;
    venueTotals.set(booking.hotel_id, (venueTotals.get(booking.hotel_id) ?? 0) + amount);
  }

  for (const month of months) {
    for (const id of Object.keys(month.byVenue)) {
      const cell = month.byVenue[id];
      cell.averageBasket = cell.count > 0 ? round2(cell.revenue / cell.count) : 0;
      cell.revenue = round2(cell.revenue);
    }
  }

  const nameById = new Map(opts.venues.map((v) => [v.id, v.name]));
  const venues = Array.from(venueTotals.keys())
    .sort((a, b) => (venueTotals.get(b) ?? 0) - (venueTotals.get(a) ?? 0))
    .map((id) => ({ id, name: nameById.get(id) ?? "—" }));

  return { venues, months };
}

/**
 * Agrège les réservations par mois sur une fenêtre fixe
 * (6 mois passés + mois courant + 3 mois futurs).
 * Mois futurs = carnet de commandes (réservations déjà en base).
 */
export function buildMonthlyOutlook(
  bookings: readonly OutlookBooking[],
  opts: {
    venueId: string; // "all" ou hotel_id
    toEUR: (price: number | null, hotelId: string) => number;
    now?: Date;
  },
): MonthlyOutlookPoint[] {
  const current = startOfMonth(opts.now ?? new Date());
  const currentKey = format(current, "yyyy-MM");

  const points = new Map<string, MonthlyOutlookPoint>();
  for (let i = -OUTLOOK_PAST_MONTHS; i <= OUTLOOK_FUTURE_MONTHS; i++) {
    const month = i < 0 ? subMonths(current, -i) : addMonths(current, i);
    const monthKey = format(month, "yyyy-MM");
    points.set(monthKey, {
      monthKey,
      isCurrent: i === 0,
      isFuture: i > 0,
      confirmedRevenue: 0,
      pendingRevenue: 0,
      confirmedCount: 0,
      pendingCount: 0,
      totalRevenue: 0,
      totalCount: 0,
      averageBasket: 0,
    });
  }

  for (const booking of bookings) {
    if (opts.venueId !== "all" && booking.hotel_id !== opts.venueId) continue;
    if (EXCLUDED_STATUSES.has(booking.status)) continue;
    const monthKey = booking.booking_date?.slice(0, 7);
    const point = monthKey ? points.get(monthKey) : undefined;
    if (!point) continue;

    const amount = opts.toEUR(booking.total_price, booking.hotel_id);
    if (booking.status === "pending") {
      point.pendingRevenue += amount;
      point.pendingCount += 1;
    } else {
      point.confirmedRevenue += amount;
      point.confirmedCount += 1;
    }
  }

  return Array.from(points.values()).map((p) => {
    const totalRevenue = p.confirmedRevenue + p.pendingRevenue;
    const totalCount = p.confirmedCount + p.pendingCount;
    return {
      ...p,
      confirmedRevenue: Math.round(p.confirmedRevenue * 100) / 100,
      pendingRevenue: Math.round(p.pendingRevenue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCount,
      averageBasket: totalCount > 0 ? Math.round((totalRevenue / totalCount) * 100) / 100 : 0,
    };
  });
}

/**
 * Équivalent de buildMonthlyOutlook à partir des agrégats serveur.
 * `venueId` reste un filtre appliqué ici : la RPC renvoie tous les lieux du
 * scope, ce dont buildMonthlyOutlookByVenueFromAggregates a besoin.
 */
export function buildMonthlyOutlookFromAggregates(
  rows: readonly OutlookAggregate[],
  opts: AggregateOpts & { venueId: string },
): MonthlyOutlookPoint[] {
  const points = new Map<string, MonthlyOutlookPoint>();
  for (const { monthKey, isCurrent, isFuture } of outlookMonths(opts.now)) {
    points.set(monthKey, {
      monthKey,
      isCurrent,
      isFuture,
      confirmedRevenue: 0,
      pendingRevenue: 0,
      confirmedCount: 0,
      pendingCount: 0,
      totalRevenue: 0,
      totalCount: 0,
      averageBasket: 0,
    });
  }

  for (const row of rows) {
    if (opts.venueId !== "all" && row.hotelId !== opts.venueId) continue;
    const point = points.get(row.monthKey);
    if (!point) continue;

    const amount = opts.toEUR(row.revenue, row.hotelId);
    if (row.bucket === "pending") {
      point.pendingRevenue += amount;
      point.pendingCount += row.bookingCount;
    } else {
      point.confirmedRevenue += amount;
      point.confirmedCount += row.bookingCount;
    }
  }

  return Array.from(points.values()).map((p) => {
    const totalRevenue = p.confirmedRevenue + p.pendingRevenue;
    const totalCount = p.confirmedCount + p.pendingCount;
    return {
      ...p,
      confirmedRevenue: round2(p.confirmedRevenue),
      pendingRevenue: round2(p.pendingRevenue),
      totalRevenue: round2(totalRevenue),
      totalCount,
      averageBasket: totalCount > 0 ? round2(totalRevenue / totalCount) : 0,
    };
  });
}

/** Équivalent de buildMonthlyOutlookByVenue à partir des agrégats serveur. */
export function buildMonthlyOutlookByVenueFromAggregates(
  rows: readonly OutlookAggregate[],
  opts: AggregateOpts & { venues: ReadonlyArray<{ id: string; name: string }> },
): MonthlyOutlookByVenue {
  const months: MonthlyOutlookByVenueMonth[] = [];
  const byMonth = new Map<string, MonthlyOutlookByVenueMonth>();
  for (const { monthKey, isCurrent, isFuture } of outlookMonths(opts.now)) {
    const entry: MonthlyOutlookByVenueMonth = { monthKey, isCurrent, isFuture, byVenue: {} };
    months.push(entry);
    byMonth.set(monthKey, entry);
  }

  const venueTotals = new Map<string, number>(); // hotel_id → CA total (pour tri)
  for (const row of rows) {
    const month = byMonth.get(row.monthKey);
    if (!month) continue;

    const amount = opts.toEUR(row.revenue, row.hotelId);
    const cell = month.byVenue[row.hotelId] ?? { revenue: 0, count: 0, averageBasket: 0 };
    cell.revenue += amount;
    cell.count += row.bookingCount;
    month.byVenue[row.hotelId] = cell;
    venueTotals.set(row.hotelId, (venueTotals.get(row.hotelId) ?? 0) + amount);
  }

  for (const month of months) {
    for (const id of Object.keys(month.byVenue)) {
      const cell = month.byVenue[id];
      cell.averageBasket = cell.count > 0 ? round2(cell.revenue / cell.count) : 0;
      cell.revenue = round2(cell.revenue);
    }
  }

  const nameById = new Map(opts.venues.map((v) => [v.id, v.name]));
  const venues = Array.from(venueTotals.keys())
    .sort((a, b) => (venueTotals.get(b) ?? 0) - (venueTotals.get(a) ?? 0))
    .map((id) => ({ id, name: nameById.get(id) ?? "—" }));

  return { venues, months };
}
