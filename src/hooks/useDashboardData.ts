import { useState, useEffect, useMemo } from "react";
import { format, differenceInDays, addDays, subDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertToEUR, type ExchangeRatesMap } from "@/lib/currencyConversion";
import { formatPrice } from "@/lib/formatPrice";
import { bookingStatusConfig, type BookingStatus } from "@/utils/statusStyles";

// ── Types ───────────────────────────────────────────────────────────

interface BookingRow {
  booking_date: string;
  booking_time: string;
  total_price: number | null;
  hotel_id: string;
  hotel_name: string | null;
  status: string;
  payment_status: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  room_id: string | null;
  duration: number | null;
  booking_treatments: { treatment_menus: { name: string } | null }[];
}

interface HotelRow {
  id: string;
  name: string;
  currency: string | null;
}

interface RoomRow {
  id: string;
  hotel_id: string;
}

interface AvailabilityRow {
  therapist_id: string;
}

interface AssignmentRow {
  therapist_id: string;
  hotel_id: string;
}

export interface AlertsData {
  unassigned: number;
  failedPayments: number;
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
}

export interface ForecastPoint {
  day: string;
  confirmed: number;
  pending: number;
}

export interface HotelOverviewRow {
  name: string;
  totalSales: string;
  totalBookings: number;
  totalSessions: number;
  totalCancelled: number;
}

export interface DashboardStats {
  totalSales: string;
  totalBookings: number;
  todayBookings: number;
  pendingPayment: number;
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
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { rates } = useExchangeRates();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [bookingsRes, hotelsRes, roomsRes, availRes, assignRes] =
        await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, booking_date, booking_time, total_price, hotel_id, hotel_name, status, payment_status, therapist_id, therapist_name, room_id, duration"
            )
            .order("booking_date", { ascending: true }),
          supabase
            .from("hotels")
            .select("id, name, currency")
            .order("created_at", { ascending: false }),
          supabase
            .from("treatment_rooms")
            .select("id, hotel_id")
            .in("status", ["active", "Actif"]),
          supabase
            .from("therapist_availability")
            .select("therapist_id")
            .eq("date", todayStr)
            .eq("is_available", true),
          supabase
            .from("therapist_venues")
            .select("therapist_id, hotel_id"),
        ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (hotelsRes.error) throw hotelsRes.error;

      // Fetch treatment names separately (non-blocking — if it fails, Top 3 soins is empty)
      let treatmentMap: Record<string, string[]> = {};
      try {
        const { data: btData } = await supabase
          .from("booking_treatments")
          .select("booking_id, treatment_menus(name)");
        if (btData) {
          btData.forEach((bt: any) => {
            const name = bt.treatment_menus?.name;
            if (name && bt.booking_id) {
              if (!treatmentMap[bt.booking_id]) treatmentMap[bt.booking_id] = [];
              treatmentMap[bt.booking_id].push(name);
            }
          });
        }
      } catch {
        // Non-critical — Top 3 soins will just be empty
      }

      // Merge treatment names into bookings
      const bookingsWithTreatments = (bookingsRes.data || []).map((b: any) => ({
        ...b,
        booking_treatments: (treatmentMap[b.id] || []).map((name: string) => ({
          treatment_menus: { name },
        })),
      }));

      setBookings(bookingsWithTreatments as BookingRow[]);
      setHotels(hotelsRes.data || []);
      setRooms(roomsRes.data || []);
      setAvailability(availRes.data || []);
      setAssignments(assignRes.data || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

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

    const cancelled = filteredBookings.filter((b) => b.status === "cancelled").length;
    const cancellationRate = totalBookings > 0 ? Math.round((cancelled / totalBookings) * 100) : 0;

    const averageBasket = totalBookings > 0 ? (totalSales / totalBookings).toFixed(2) : "0.00";

    // Trends vs previous period
    const prevSales = prevFilteredBookings.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
    const prevCount = prevFilteredBookings.length;
    const salesTrend = prevSales > 0 ? Math.round(((totalSales - prevSales) / prevSales) * 100) : 0;
    const bookingsTrend = prevCount > 0 ? Math.round(((totalBookings - prevCount) / prevCount) * 100) : 0;

    return {
      totalSales: totalSales.toFixed(2),
      totalBookings,
      todayBookings,
      pendingPayment,
      cancellationRate,
      averageBasket,
      salesTrend,
      bookingsTrend,
    };
  }, [filteredBookings, prevFilteredBookings, bookings, selectedHotel, rates]);

  // ── Alerts (global, not filtered by period) ───────────────────────

  const alerts = useMemo<AlertsData>(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const relevant = selectedHotel === "all"
      ? bookings
      : bookings.filter((b) => b.hotel_id === selectedHotel);

    return {
      unassigned: relevant.filter(
        (b) => b.status === "pending" && b.booking_date >= todayStr
      ).length,
      failedPayments: relevant.filter(
        (b) => b.payment_status === "failed"
      ).length,
    };
  }, [bookings, selectedHotel]);

  // ── Room occupancy today ──────────────────────────────────────────

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

  // ── Active therapists today ───────────────────────────────────────

  const activeTherapists = useMemo<OccupancyData>(() => {
    const venueTherapistIds =
      selectedHotel === "all"
        ? new Set(assignments.map((a) => a.therapist_id))
        : new Set(assignments.filter((a) => a.hotel_id === selectedHotel).map((a) => a.therapist_id));

    const availableIds = new Set(
      availability
        .filter((a) => venueTherapistIds.has(a.therapist_id))
        .map((a) => a.therapist_id)
    );

    return { used: availableIds.size, total: venueTherapistIds.size };
  }, [assignments, availability, selectedHotel]);

  // ── Sales chart data ──────────────────────────────────────────────

  const salesChartData = useMemo<ChartPoint[]>(() => {
    const days = differenceInDays(endDate, startDate);
    if (filteredBookings.length === 0) return [];

    // For "Today", generate hourly points
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
        };
      });
    }

    // Group sales by date
    const salesByDate: Record<string, number> = {};
    for (let i = 0; i <= days; i++) {
      salesByDate[format(addDays(startDate, i), "yyyy-MM-dd")] = 0;
    }
    filteredBookings.forEach((b) => {
      if (salesByDate.hasOwnProperty(b.booking_date)) {
        salesByDate[b.booking_date] += toEUR(b.total_price, b.hotel_id);
      }
    });

    const allDates = Object.entries(salesByDate).sort((a, b) => a[0].localeCompare(b[0]));
    const maxPoints = 15;

    const sampled =
      allDates.length <= maxPoints
        ? allDates
        : (() => {
            const interval = Math.ceil(allDates.length / maxPoints);
            return allDates.filter((_, i) => i % interval === 0 || i === allDates.length - 1);
          })();

    return sampled.map(([dateStr, sales]) => ({
      date: format(parseISO(dateStr), "dd MMM", { locale: fr }),
      sales,
    }));
  }, [filteredBookings, startDate, endDate, rates]);

  // ── Status distribution (donut) ───────────────────────────────────

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

  // ── Week forecast (bar chart) ─────────────────────────────────────

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

  // ── Top 3 venues ──────────────────────────────────────────────────

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

  // ── Top 3 therapists ──────────────────────────────────────────────

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

  // ── Top 3 treatments ──────────────────────────────────────────────

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

  // ── Hotel overview table ──────────────────────────────────────────

  const hotelData = useMemo<HotelOverviewRow[]>(
    () =>
      hotels.map((hotel) => {
        const hb = filteredBookings.filter((b) => b.hotel_id === hotel.id);
        const totalSales = hb.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
        return {
          name: hotel.name,
          totalSales: formatPrice(totalSales),
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
