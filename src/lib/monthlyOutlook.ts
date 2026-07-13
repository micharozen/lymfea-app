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
