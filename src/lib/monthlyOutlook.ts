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
