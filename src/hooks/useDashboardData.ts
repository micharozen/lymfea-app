import { useEffect, useMemo, useState } from "react";
import { format, differenceInDays, addDays, subDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertToEUR } from "@/lib/currencyConversion";
import { formatPrice } from "@/lib/formatPrice";
import { bookingStatusConfig, type BookingStatus } from "@/utils/statusStyles";
import { useOrgScope } from "@/hooks/useOrgScope";
import { getDashboardDataForOrg, type DashboardBooking } from "@shared/db";

// ── Types ───────────────────────────────────────────────────────────

type BookingRow = DashboardBooking & {
  client_type?: string | null;
  room_number?: string | null;
  booking_treatments: { treatment_menus: { name: string } | null }[];
};

interface HotelRow {
  id: string;
  name: string;
  currency: string | null;
  opening_time: string | null;
  closing_time: string | null;
}

interface RoomRow {
  id: string;
  hotel_id: string | null;
}

export interface AlertsData {
  unassigned: number;
  pendingPayments: number;
  pendingPaymentBookings: PendingPaymentBooking[];
  failedPayments: number;
}

export interface PendingPaymentBooking {
  id: string;
  bookingNumber: number | null;
  date: string;
  time: string | null;
  hotelName: string | null;
  amount: string;
}

export interface OccupancyData {
  used: number;
  total: number;
}

export interface RankingItem {
  name: string;
  revenue: number;
  bookings: number;
}

export interface StatusSlice {
  name: string;
  value: number;
  color: string;
  status: string;
}

export interface ChartPoint {
  date: string;
  sales: number;
  prestations: number;
}

export interface HourlyOccupancyPoint {
  hour: string;
  hourIndex: number;
  used: number;
  total: number;
  rate: number;
  outOfHours: boolean;
}

export interface ForecastPoint {
  day: string;
  confirmed: number;
  pending: number;
}

export interface HotelOverviewRow {
  name: string;
  totalSales: string;
  totalSalesValue: number;
  totalBookings: number;
  totalSessions: number;
  totalCancelled: number;
}

export interface DashboardStats {
  totalSales: string;
  totalBookings: number;
  todayBookings: number;
  pendingPayment: number;
  missingRoomNumber: number;
  cancellationRate: number;
  averageBasket: string;
  salesTrend: number;
  bookingsTrend: number;
}

export interface DashboardData {
  loading: boolean;
  hotels: HotelRow[];
  stats: DashboardStats;
  alerts: AlertsData;
  roomOccupancy: OccupancyData;
  roomOccupancyHourly: HourlyOccupancyPoint[];
  roomOccupancyHourlyMeta: { openingHour: number; closingHour: number };
  activeTherapists: OccupancyData;
  salesChartData: ChartPoint[];
  statusDistribution: StatusSlice[];
  weekForecast: ForecastPoint[];
  topVenues: RankingItem[];
  topTherapists: RankingItem[];
  topTreatments: RankingItem[];
  hotelData: HotelOverviewRow[];
}

// ── Hook ────────────────────────────────────────────────────────────

export function useDashboardData(
  startDate: Date,
  endDate: Date,
  selectedHotel: string
): DashboardData {
  const scope = useOrgScope();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [availabilityIds, setAvailabilityIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Array<{ therapist_id: string; hotel_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const { rates } = useExchangeRates();

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getDashboardDataForOrg(supabase, scope);

        // Fetch treatment names for the bookings we got (non-blocking).
        const treatmentMap: Record<string, string[]> = {};
        const bookingIds = data.bookings.map((b) => b.id);
        if (bookingIds.length > 0) {
          try {
            const { data: btData } = await supabase
              .from("booking_treatments")
              .select("booking_id, treatment_menus(name)")
              .in("booking_id", bookingIds);
            if (btData) {
              btData.forEach((bt: { booking_id: string | null; treatment_menus: { name: string } | null }) => {
                const name = bt.treatment_menus?.name;
                if (name && bt.booking_id) {
                  if (!treatmentMap[bt.booking_id]) treatmentMap[bt.booking_id] = [];
                  treatmentMap[bt.booking_id].push(name);
                }
              });
            }
          } catch {
            // Non-critical
          }
        }

        if (cancelled) return;
        setBookings(
          data.bookings.map((b) => ({
            ...b,
            booking_treatments: (treatmentMap[b.id] || []).map((name) => ({
              treatment_menus: { name },
            })),
          })),
        );
        setHotels(data.hotels);
        setRooms(data.treatmentRooms);
        setAvailabilityIds(data.todayAvailableTherapistIds);
        setAssignments(data.therapistVenues);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  // ── Currency map ──────────────────────────────────────────────────

  const hotelCurrencyMap = useMemo(() => {
    const map: Record<string, string> = {};
    hotels.forEach((h) => {
      map[h.id] = h.currency || "EUR";
    });
    return map;
  }, [hotels]);

  // ── Helpers ───────────────────────────────────────────────────────

  const toEUR = (price: number | null, hotelId: string) =>
    convertToEUR(parseFloat(String(price)) || 0, hotelCurrencyMap[hotelId] || "EUR", rates);

  // ── Filtered bookings (by period + venue) ─────────────────────────

  const filteredBookings = useMemo(
    () =>
      bookings.filter((b) => {
        const d = parseISO(b.booking_date);
        const matchDate = isWithinInterval(d, { start: startDate, end: endDate });
        const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
        return matchDate && matchHotel;
      }),
    [bookings, startDate, endDate, selectedHotel]
  );

  // ── Previous period bookings (for trends) ─────────────────────────

  const prevFilteredBookings = useMemo(() => {
    const daysDiff = differenceInDays(endDate, startDate);
    const prevEnd = subDays(startDate, 1);
    const prevStart = subDays(startDate, daysDiff + 1);
    return bookings.filter((b) => {
      const d = parseISO(b.booking_date);
      const matchDate = isWithinInterval(d, { start: prevStart, end: prevEnd });
      const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
      return matchDate && matchHotel;
    });
  }, [bookings, startDate, endDate, selectedHotel]);

  // ── Stats ─────────────────────────────────────────────────────────

  const stats = useMemo<DashboardStats>(() => {
    const totalSales = filteredBookings.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
    const totalBookings = filteredBookings.length;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayBookings = bookings.filter((b) => {
      const matchDate = b.booking_date === todayStr;
      const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
      return matchDate && matchHotel;
    }).length;

    const pendingPayment = filteredBookings.filter(
      (b) => b.payment_status === "pending"
    ).length;

    // Hotel bookings (today or future, not cancelled) without a room number assigned
    const missingRoomNumber = bookings.filter((b) => {
      const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
      if (!matchHotel) return false;
      if (b.client_type !== "hotel") return false;
      if (b.status === "cancelled") return false;
      if (b.room_number && b.room_number.trim() !== "") return false;
      return b.booking_date >= todayStr;
    }).length;

    const cancelled = filteredBookings.filter((b) => b.status === "cancelled").length;
    const cancellationRate = totalBookings > 0 ? Math.round((cancelled / totalBookings) * 100) : 0;

    const averageBasket = totalBookings > 0 ? (totalSales / totalBookings).toFixed(2) : "0.00";

    const prevSales = prevFilteredBookings.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
    const prevCount = prevFilteredBookings.length;
    const salesTrend = prevSales > 0 ? Math.round(((totalSales - prevSales) / prevSales) * 100) : 0;
    const bookingsTrend = prevCount > 0 ? Math.round(((totalBookings - prevCount) / prevCount) * 100) : 0;

    return {
      totalSales: totalSales.toFixed(2),
      totalBookings,
      todayBookings,
      pendingPayment,
      missingRoomNumber,
      cancellationRate,
      averageBasket,
      salesTrend,
      bookingsTrend,
    };
  }, [filteredBookings, prevFilteredBookings, bookings, selectedHotel, rates]);

  const alerts = useMemo<AlertsData>(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const relevant = selectedHotel === "all"
      ? bookings
      : bookings.filter((b) => b.hotel_id === selectedHotel);

    const pendingPaymentBookings = relevant
      .filter((b) => b.payment_status === "pending" && b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        bookingNumber: b.booking_id,
        date: format(parseISO(b.booking_date), "dd/MM/yyyy"),
        time: b.booking_time,
        hotelName: b.hotel_name,
        amount: formatPrice(toEUR(b.total_price, b.hotel_id)),
      }));

    return {
      unassigned: relevant.filter(
        (b) => b.status === "pending" && b.booking_date >= todayStr
      ).length,
      pendingPayments: pendingPaymentBookings.length,
      pendingPaymentBookings,
      failedPayments: relevant.filter(
        (b) => b.payment_status === "failed"
      ).length,
    };
  }, [bookings, selectedHotel, rates]);

  const roomOccupancy = useMemo<OccupancyData>(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayBookingsWithRoom = bookings.filter((b) => {
      const matchDate = b.booking_date === todayStr;
      const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
      const hasRoom = !!b.room_id;
      const activeStatus = ["confirmed", "ongoing", "completed"].includes(b.status);
      return matchDate && matchHotel && hasRoom && activeStatus;
    });
    const usedRoomIds = new Set(todayBookingsWithRoom.map((b) => b.room_id));

    const totalRooms = selectedHotel === "all"
      ? rooms.length
      : rooms.filter((r) => r.hotel_id === selectedHotel).length;

    return { used: usedRoomIds.size, total: totalRooms };
  }, [bookings, rooms, selectedHotel]);

  // ── Hourly room occupancy (today) ─────────────────────────────────

  const { roomOccupancyHourly, roomOccupancyHourlyMeta } = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const scopedHotels =
      selectedHotel === "all" ? hotels : hotels.filter((h) => h.id === selectedHotel);

    const parseHour = (t: string | null | undefined, fallback: number): number => {
      if (!t) return fallback;
      const [h, m] = t.split(":").map((n) => parseInt(n, 10));
      if (Number.isNaN(h)) return fallback;
      return h + (Number.isNaN(m) ? 0 : m / 60);
    };

    const openings = scopedHotels
      .map((h) => parseHour(h.opening_time, NaN))
      .filter((n) => !Number.isNaN(n));
    const closings = scopedHotels
      .map((h) => parseHour(h.closing_time, NaN))
      .filter((n) => !Number.isNaN(n));

    const openingHourRaw = openings.length > 0 ? Math.min(...openings) : 9;
    const closingHourRaw = closings.length > 0 ? Math.max(...closings) : 20;
    const openingHour = Math.floor(openingHourRaw);
    const closingHour = Math.ceil(closingHourRaw);

    const startHour = Math.max(0, openingHour - 2);
    const endHour = Math.min(24, closingHour + 2);

    const totalRooms =
      selectedHotel === "all"
        ? rooms.length
        : rooms.filter((r) => r.hotel_id === selectedHotel).length;

    const todaysBookings = bookings.filter((b) => {
      const matchDate = b.booking_date === todayStr;
      const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
      const hasRoom = !!b.room_id;
      const activeStatus = ["pending", "confirmed", "ongoing", "completed"].includes(b.status);
      return matchDate && matchHotel && hasRoom && activeStatus;
    });

    const points: HourlyOccupancyPoint[] = [];
    for (let h = startHour; h < endHour; h++) {
      const slotStart = h;
      const slotEnd = h + 1;
      const usedRoomIds = new Set<string>();
      todaysBookings.forEach((b) => {
        const [bh, bm] = (b.booking_time || "0:0").split(":").map((n) => parseInt(n, 10));
        const bookingStart = (Number.isNaN(bh) ? 0 : bh) + (Number.isNaN(bm) ? 0 : bm) / 60;
        const durationHours = (b.duration ?? 60) / 60;
        const bookingEnd = bookingStart + durationHours;
        if (bookingStart < slotEnd && bookingEnd > slotStart && b.room_id) {
          usedRoomIds.add(b.room_id);
        }
      });
      const used = usedRoomIds.size;
      points.push({
        hour: `${String(h).padStart(2, "0")}h`,
        hourIndex: h,
        used,
        total: totalRooms,
        rate: totalRooms > 0 ? Math.round((used / totalRooms) * 100) : 0,
        outOfHours: h < openingHour || h >= closingHour,
      });
    }

    return {
      roomOccupancyHourly: points,
      roomOccupancyHourlyMeta: { openingHour, closingHour },
    };
  }, [bookings, rooms, hotels, selectedHotel]);

  // ── Active therapists today ───────────────────────────────────────

  const activeTherapists = useMemo<OccupancyData>(() => {
    const venueTherapistIds =
      selectedHotel === "all"
        ? new Set(assignments.map((a) => a.therapist_id))
        : new Set(assignments.filter((a) => a.hotel_id === selectedHotel).map((a) => a.therapist_id));

    const availableIds = new Set(
      availabilityIds.filter((id) => venueTherapistIds.has(id))
    );

    return { used: availableIds.size, total: venueTherapistIds.size };
  }, [assignments, availabilityIds, selectedHotel]);

  const salesChartData = useMemo<ChartPoint[]>(() => {
    const days = differenceInDays(endDate, startDate);
    if (filteredBookings.length === 0) return [];

    const prestationCount = (b: (typeof filteredBookings)[number]) =>
      (b.booking_treatments || []).length;

    if (days === 0) {
      return Array.from({ length: 8 }, (_, i) => {
        const hour = 9 + i * 2;
        const hourBookings = filteredBookings.filter((b) => {
          const bh = parseInt(b.booking_time?.split(":")[0] || "0");
          return bh >= hour && bh < hour + 2;
        });
        return {
          date: `${hour}h`,
          sales: hourBookings.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0),
          prestations: hourBookings.reduce((s, b) => s + prestationCount(b), 0),
        };
      });
    }

    const salesByDate: Record<string, number> = {};
    const prestationsByDate: Record<string, number> = {};
    for (let i = 0; i <= days; i++) {
      const key = format(addDays(startDate, i), "yyyy-MM-dd");
      salesByDate[key] = 0;
      prestationsByDate[key] = 0;
    }
    filteredBookings.forEach((b) => {
      if (Object.prototype.hasOwnProperty.call(salesByDate, b.booking_date)) {
        salesByDate[b.booking_date] += toEUR(b.total_price, b.hotel_id);
        prestationsByDate[b.booking_date] += prestationCount(b);
      }
    });

    const allDates = Object.keys(salesByDate).sort((a, b) => a.localeCompare(b));
    const maxPoints = 15;

    const sampled =
      allDates.length <= maxPoints
        ? allDates
        : (() => {
            const interval = Math.ceil(allDates.length / maxPoints);
            return allDates.filter((_, i) => i % interval === 0 || i === allDates.length - 1);
          })();

    return sampled.map((dateStr) => ({
      date: format(parseISO(dateStr), "dd MMM", { locale: fr }),
      sales: salesByDate[dateStr],
      prestations: prestationsByDate[dateStr],
    }));
  }, [filteredBookings, startDate, endDate, rates]);

  const statusDistribution = useMemo<StatusSlice[]>(() => {
    const counts: Record<string, number> = {};
    filteredBookings.forEach((b) => {
      counts[b.status] = (counts[b.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, value]) => ({
        name: bookingStatusConfig[status as BookingStatus]?.label || status,
        value,
        color: bookingStatusConfig[status as BookingStatus]?.hexColor || "#6b7280",
        status,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredBookings]);

  const weekForecast = useMemo<ForecastPoint[]>(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const dayBookings = bookings.filter((b) => {
        const matchDate = b.booking_date === dateStr;
        const matchHotel = selectedHotel === "all" || b.hotel_id === selectedHotel;
        return matchDate && matchHotel;
      });
      return {
        day: i === 0 ? "Auj." : format(d, "EEE", { locale: fr }),
        confirmed: dayBookings.filter((b) => b.status === "confirmed").length,
        pending: dayBookings.filter((b) => b.status === "pending").length,
      };
    });
  }, [bookings, selectedHotel]);

  const topVenues = useMemo<RankingItem[]>(() => {
    const map: Record<string, RankingItem> = {};
    filteredBookings.forEach((b) => {
      if (!map[b.hotel_id]) {
        const hotel = hotels.find((h) => h.id === b.hotel_id);
        map[b.hotel_id] = { name: hotel?.name || b.hotel_name || "Inconnu", revenue: 0, bookings: 0 };
      }
      map[b.hotel_id].revenue += toEUR(b.total_price, b.hotel_id);
      map[b.hotel_id].bookings += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [filteredBookings, hotels, rates]);

  const topTherapists = useMemo<RankingItem[]>(() => {
    const map: Record<string, RankingItem> = {};
    filteredBookings.forEach((b) => {
      if (!b.therapist_id) return;
      if (!map[b.therapist_id]) {
        map[b.therapist_id] = { name: b.therapist_name || "Inconnu", revenue: 0, bookings: 0 };
      }
      map[b.therapist_id].revenue += toEUR(b.total_price, b.hotel_id);
      map[b.therapist_id].bookings += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [filteredBookings, rates]);

  const topTreatments = useMemo<RankingItem[]>(() => {
    const map: Record<string, RankingItem> = {};
    filteredBookings.forEach((b) => {
      const treatments = b.booking_treatments || [];
      treatments.forEach((bt) => {
        const name = bt.treatment_menus?.name;
        if (!name) return;
        if (!map[name]) {
          map[name] = { name, revenue: 0, bookings: 0 };
        }
        map[name].revenue += toEUR(b.total_price, b.hotel_id);
        map[name].bookings += 1;
      });
    });
    return Object.values(map)
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 3);
  }, [filteredBookings, rates]);

  const hotelData = useMemo<HotelOverviewRow[]>(
    () =>
      hotels.map((hotel) => {
        const hb = filteredBookings.filter((b) => b.hotel_id === hotel.id);
        const totalSales = hb.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
        return {
          name: hotel.name,
          totalSales: formatPrice(totalSales),
          totalSalesValue: totalSales,
          totalBookings: hb.length,
          totalSessions: hb.filter((b) => b.status === "completed").length,
          totalCancelled: hb.filter((b) => b.status === "cancelled").length,
        };
      }),
    [filteredBookings, hotels, rates]
  );

  return {
    loading,
    hotels,
    stats,
    alerts,
    roomOccupancy,
    roomOccupancyHourly,
    roomOccupancyHourlyMeta,
    activeTherapists,
    salesChartData,
    statusDistribution,
    weekForecast,
    topVenues,
    topTherapists,
    topTreatments,
    hotelData,
  };
}
