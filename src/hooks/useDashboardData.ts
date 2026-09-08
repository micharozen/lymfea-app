import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  format,
  differenceInCalendarDays,
  differenceInDays,
  addDays,
  addMonths,
  endOfMonth,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertToEUR } from "@/lib/currencyConversion";
import { formatPrice } from "@/lib/formatPrice";
import { getBookingStatusConfig } from "@/utils/statusStyles";
import { normalizeBookingClientType } from "@/lib/clientTypeMeta";
import { useOrgScope } from "@/hooks/useOrgScope";
import {
  dashboardKeys,
  fetchScopedHotelIds,
  fetchDashboardReference,
  fetchPeriodBookings,
  fetchUpcomingBookings,
  fetchMonthlyOutlook,
  fetchLeadTimeBookings,
  fetchPaymentAlerts,
  type DashboardReference,
  type PeriodBooking,
  type UpcomingBooking,
  type PaymentAlertBooking,
  type LeadTimeBooking,
  type OutlookAggregateRow,
} from "@shared/db";
import {
  buildMonthlyOutlookFromAggregates,
  buildMonthlyOutlookByVenueFromAggregates,
  OUTLOOK_FUTURE_MONTHS,
  OUTLOOK_PAST_MONTHS,
  type MonthlyOutlookByVenue,
  type MonthlyOutlookPoint,
} from "@/lib/monthlyOutlook";

export type { MonthlyOutlookPoint, MonthlyOutlookByVenue } from "@/lib/monthlyOutlook";

// ── Types ───────────────────────────────────────────────────────────

interface HotelRow {
  id: string;
  name: string;
  currency: string | null;
  opening_time: string | null;
  closing_time: string | null;
}

export interface AlertsData {
  unassigned: number;
  unassignedBookings: AlertBooking[];
  pendingPayments: number;
  pendingPaymentBookings: AlertBooking[];
  failedPayments: number;
}

export interface AlertBooking {
  id: string;
  bookingNumber: number | null;
  date: string;
  daysUntil: number;
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

// Occupation d'une salle sur un créneau d'1h, basée sur la capacité simultanée.
export interface RoomHeatmapCell {
  hourIndex: number;
  seats: number; // places occupées simultanément sur le créneau
  capacity: number; // capacité de la salle (≥ 1)
  rate: number; // seats / capacity en % (borné à 100)
  outOfHours: boolean;
}

export interface RoomHeatmapRow {
  roomId: string;
  roomName: string;
  hotelId: string;
  hotelName: string;
  capacity: number;
  cells: RoomHeatmapCell[];
  dayRate: number; // occupation moyenne de la salle sur les heures d'ouverture (%)
}

export interface RoomOccupancyHeatmap {
  rooms: RoomHeatmapRow[];
  hours: number[]; // index horaires affichés (colonnes)
  openingHour: number;
  closingHour: number;
}

export interface ForecastPoint {
  day: string;
  confirmed: number;
  pending: number;
}

export interface LeadTimeByTreatment {
  name: string;
  averageDays: number;
  count: number;
}

export interface LeadTimeData {
  averageDays: number;
  count: number;
  byTreatment: LeadTimeByTreatment[];
}

export interface HotelOverviewRow {
  name: string;
  totalSales: string;
  totalSalesValue: number;
  totalBookings: number;
  totalSessions: number;
  totalCancelled: number;
}

/** Une part du mix : volume, poids dans le total, évolution vs période précédente. */
export interface MixSegment {
  count: number;
  share: number; // % du total de la période (0-100)
  trend: number; // % d'évolution du volume vs période précédente
}

export interface ClientMixData {
  hotel: MixSegment;
  external: MixSegment;
  total: number;
}

/** Une part du canal : volume, poids, et écart de poids en points vs période préc. */
export interface ChannelSegment {
  count: number;
  share: number; // % du total de la période (0-100)
  shareDelta: number; // écart de part en points vs période précédente
}

export interface BookingChannelData {
  online: ChannelSegment;
  manual: ChannelSegment;
  total: number;
}

export interface DashboardStats {
  totalSales: string;
  totalBookings: number;
  todayBookings: number;
  todayConfirmed: number;
  pendingPayment: number;
  missingRoomNumber: number;
  cancelledBookings: number;
  cancellationRate: number;
  averageBasket: string;
  salesTrend: number;
  bookingsTrend: number;
}

/**
 * État de chargement par section. La page n'attend plus la donnée la plus
 * lente : chaque bloc affiche son squelette jusqu'à l'arrivée de SA source.
 */
export interface DashboardPending {
  reference: boolean;
  period: boolean;
  upcoming: boolean;
  outlook: boolean;
  leadTime: boolean;
  alerts: boolean;
}

export interface DashboardData {
  /**
   * Aucune organisation active : état terminal, pas un chargement. C'est le
   * cas du super-admin qui n'a pas encore choisi d'organisation — il ne faut
   * surtout pas lui afficher un squelette perpétuel.
   */
  scopeMissing: boolean;
  pending: DashboardPending;
  /** Au moins une requête a échoué : de quoi afficher un bandeau d'erreur. */
  hasError: boolean;
  hotels: HotelRow[];
  stats: DashboardStats;
  clientMix: ClientMixData;
  bookingChannel: BookingChannelData;
  alerts: AlertsData;
  roomOccupancy: OccupancyData;
  roomOccupancyHeatmap: RoomOccupancyHeatmap;
  activeTherapists: OccupancyData;
  salesChartData: ChartPoint[];
  statusDistribution: StatusSlice[];
  weekForecast: ForecastPoint[];
  monthlyOutlook: MonthlyOutlookPoint[];
  monthlyOutlookByVenue: MonthlyOutlookByVenue;
  leadTime: LeadTimeData;
  topVenues: RankingItem[];
  topTherapists: RankingItem[];
  topTreatments: RankingItem[];
  hotelData: HotelOverviewRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Part de `value` dans `total`, en % arrondi. 0 si le total est vide. */
const percentOf = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * 100) : 0;

/** Évolution en % entre deux volumes. 0 quand la référence est vide. */
const growth = (current: number, previous: number): number =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

/**
 * Réservation prise « en ligne » : par le client lui-même (flux public) ou via
 * l'API partenaire. Tout le reste (admin, phone, concierge, pwa, email) est
 * une saisie manuelle. Valeurs contraintes par bookings_source_check.
 */
const ONLINE_BOOKING_SOURCES = new Set(["client", "api"]);
const isOnlineSource = (source: string | null | undefined): boolean =>
  ONLINE_BOOKING_SOURCES.has(source ?? "");

const iso = (d: Date) => format(d, "yyyy-MM-dd");

// Tableaux vides stables : une nouvelle référence à chaque rendu invaliderait
// tous les useMemo qui en dépendent.
const EMPTY_ROOMS: DashboardReference["treatmentRooms"] = [];
const EMPTY_ASSIGNMENTS: DashboardReference["therapistVenues"] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_PERIOD: PeriodBooking[] = [];
const EMPTY_UPCOMING: UpcomingBooking[] = [];
const EMPTY_ALERTS: PaymentAlertBooking[] = [];
const EMPTY_OUTLOOK: OutlookAggregateRow[] = [];
const EMPTY_LEAD_TIME: LeadTimeBooking[] = [];

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Données du dashboard admin.
 *
 * Le fetch est découpé en sources indépendantes, chacune ciblée sur sa propre
 * fenêtre et ses propres colonnes, au lieu d'un unique balayage de ~18 mois
 * de réservations agrégé en mémoire.
 *
 * RÈGLE À NE PAS ENFREINDRE : chaque métrique dérive d'exactement UNE source.
 * Les fenêtres se recouvrent (la période courante et le carnet à venir
 * partagent aujourd'hui, les alertes de paiement couvrent les deux) — les
 * concaténer produirait des doubles comptages silencieux.
 */
export function useDashboardData(
  startDate: Date,
  endDate: Date,
  selectedHotel: string
): DashboardData {
  const scope = useOrgScope();
  const { loading: userLoading } = useUser();
  const { rates } = useExchangeRates();

  // ── Fenêtres ──────────────────────────────────────────────────────
  // Exprimées en chaînes ISO : les clés de cache doivent être comparables,
  // pas des objets dont l'identité change à chaque rendu.

  const windows = useMemo(() => {
    const now = new Date();
    const periodDays = Math.max(0, differenceInDays(endDate, startDate));
    const prevStart = subDays(startDate, periodDays + 1);
    const prevEnd = subDays(startDate, 1);
    const outlookFrom = startOfMonth(subMonths(now, OUTLOOK_PAST_MONTHS));
    const outlookTo = startOfMonth(addMonths(now, OUTLOOK_FUTURE_MONTHS));
    // Le carnet à venir va jusqu'à un an : les compteurs « n° de chambre
    // manquant » et « sans thérapeute » doivent rester exacts sur les
    // réservations lointaines.
    const upcomingTo = endOfMonth(addMonths(now, 12));

    return {
      today: iso(now),
      start: iso(startDate),
      end: iso(endDate),
      prevStart: iso(prevStart),
      prevEnd: iso(prevEnd),
      outlookFrom: iso(outlookFrom),
      outlookTo: iso(outlookTo),
      upcomingTo: iso(upcomingTo),
      // Borne haute exclusive : created_at est un timestamp, s'arrêter à la
      // date de fin couperait sa dernière journée à minuit.
      leadTimeTo: iso(addDays(endDate, 1)),
      // Les alertes de paiement conservent leur périmètre historique — le
      // filtre payment_status est appliqué par Postgres, la largeur ne coûte
      // rien.
      alertsFrom: iso(prevStart < outlookFrom ? prevStart : outlookFrom),
    };
  }, [startDate, endDate]);

  // ── Requêtes ──────────────────────────────────────────────────────
  // Q0 résout le scope en identifiants de lieux, une fois, et débloque les
  // six autres — qui partent alors en parallèle.

  const hotelIdsQ = useQuery({
    queryKey: dashboardKeys.hotelIds(scope),
    enabled: scope !== null,
    queryFn: () => fetchScopedHotelIds(supabase, scope!),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const hotelIds = hotelIdsQ.data ?? null;
  const ready = scope !== null && hotelIdsQ.isSuccess;

  const referenceQ = useQuery({
    queryKey: dashboardKeys.reference(scope, windows.today),
    enabled: ready,
    queryFn: () => fetchDashboardReference(supabase, hotelIds, windows.today),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const periodQ = useQuery({
    queryKey: dashboardKeys.period(scope, windows.prevStart, windows.end),
    enabled: ready,
    queryFn: () =>
      fetchPeriodBookings(supabase, hotelIds, {
        fromDate: windows.prevStart,
        toDate: windows.end,
      }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const upcomingQ = useQuery({
    queryKey: dashboardKeys.upcoming(scope, windows.today, windows.upcomingTo),
    enabled: ready,
    queryFn: () =>
      fetchUpcomingBookings(supabase, hotelIds, {
        fromDate: windows.today,
        toDate: windows.upcomingTo,
      }),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });

  const outlookQ = useQuery({
    queryKey: dashboardKeys.outlook(scope, windows.outlookFrom, windows.outlookTo),
    enabled: ready,
    queryFn: () =>
      fetchMonthlyOutlook(supabase, hotelIds, {
        fromDate: windows.outlookFrom,
        toDate: windows.outlookTo,
      }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const leadTimeQ = useQuery({
    queryKey: dashboardKeys.leadTime(scope, windows.start, windows.leadTimeTo),
    enabled: ready,
    queryFn: () =>
      fetchLeadTimeBookings(supabase, hotelIds, {
        fromDate: windows.start,
        toDate: windows.leadTimeTo,
      }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const paymentAlertsQ = useQuery({
    queryKey: dashboardKeys.paymentAlerts(scope, windows.alertsFrom, windows.upcomingTo),
    enabled: ready,
    queryFn: () =>
      fetchPaymentAlerts(supabase, hotelIds, {
        fromDate: windows.alertsFrom,
        toDate: windows.upcomingTo,
      }),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });

  // ── État de chargement ────────────────────────────────────────────
  // Trois situations à ne jamais confondre : le contexte utilisateur qui se
  // résout (chargement), l'absence d'organisation active (état terminal), et
  // une requête en vol (squelette de sa section).

  const scopePending = scope === null && userLoading;
  const scopeMissing = scope === null && !userLoading;
  const basePending = scopePending || (scope !== null && hotelIdsQ.isPending);

  const pending: DashboardPending = {
    reference: basePending || referenceQ.isPending,
    period: basePending || periodQ.isPending,
    upcoming: basePending || upcomingQ.isPending,
    outlook: basePending || outlookQ.isPending,
    leadTime: basePending || leadTimeQ.isPending,
    alerts: basePending || upcomingQ.isPending || paymentAlertsQ.isPending,
  };

  const hasError =
    hotelIdsQ.isError ||
    referenceQ.isError ||
    periodQ.isError ||
    upcomingQ.isError ||
    outlookQ.isError ||
    leadTimeQ.isError ||
    paymentAlertsQ.isError;

  // ── Sources ───────────────────────────────────────────────────────

  const hotels = useMemo<HotelRow[]>(
    () => (referenceQ.data?.hotels ?? []) as HotelRow[],
    [referenceQ.data]
  );
  const rooms = referenceQ.data?.treatmentRooms ?? EMPTY_ROOMS;
  const assignments = referenceQ.data?.therapistVenues ?? EMPTY_ASSIGNMENTS;
  const availabilityIds = referenceQ.data?.todayAvailableTherapistIds ?? EMPTY_IDS;
  const periodRows = periodQ.data ?? EMPTY_PERIOD;
  const upcomingRows = upcomingQ.data ?? EMPTY_UPCOMING;
  const alertRows = paymentAlertsQ.data ?? EMPTY_ALERTS;

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

  // Cancelled and no-show bookings generate no revenue — exclude from every CA sum.
  const generatesRevenue = (b: { status: string }) =>
    b.status !== "cancelled" && b.status !== "noshow";

  const matchesHotel = (hotelId: string) =>
    selectedHotel === "all" || hotelId === selectedHotel;

  // ── Découpage de la période ───────────────────────────────────────
  // La requête ramène période courante ET précédente : on les sépare ici, sur
  // des chaînes `yyyy-MM-dd` — comparer des chaînes de date est exact, là où
  // un intervalle de Date dépend de l'heure portée par les bornes.

  const filteredBookings = useMemo(
    () =>
      periodRows.filter(
        (b) =>
          b.booking_date >= windows.start &&
          b.booking_date <= windows.end &&
          matchesHotel(b.hotel_id)
      ),
    [periodRows, windows.start, windows.end, selectedHotel]
  );

  const prevFilteredBookings = useMemo(
    () =>
      periodRows.filter(
        (b) =>
          b.booking_date >= windows.prevStart &&
          b.booking_date <= windows.prevEnd &&
          matchesHotel(b.hotel_id)
      ),
    [periodRows, windows.prevStart, windows.prevEnd, selectedHotel]
  );

  /** Carnet à venir restreint au lieu sélectionné. */
  const scopedUpcoming = useMemo(
    () => upcomingRows.filter((b) => matchesHotel(b.hotel_id)),
    [upcomingRows, selectedHotel]
  );

  // ── Stats ─────────────────────────────────────────────────────────

  const stats = useMemo<DashboardStats>(() => {
    const revenueBookings = filteredBookings.filter(generatesRevenue);
    const totalSales = revenueBookings.reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
    const totalBookings = filteredBookings.length;

    const todayRows = scopedUpcoming.filter((b) => b.booking_date === windows.today);
    const todayBookings = todayRows.length;
    const todayConfirmed = todayRows.filter((b) => b.status === "confirmed").length;

    const pendingPayment = filteredBookings.filter(
      (b) => b.payment_status === "pending"
    ).length;

    // Réservations hôtel à venir (aujourd'hui compris), non annulées, sans
    // numéro de chambre renseigné.
    const missingRoomNumber = scopedUpcoming.filter((b) => {
      if (b.client_type !== "hotel") return false;
      if (b.status === "cancelled") return false;
      if (b.room_number && b.room_number.trim() !== "") return false;
      return true;
    }).length;

    const cancelled = filteredBookings.filter((b) => b.status === "cancelled").length;
    const cancellationRate = totalBookings > 0 ? Math.round((cancelled / totalBookings) * 100) : 0;

    const averageBasket =
      revenueBookings.length > 0 ? (totalSales / revenueBookings.length).toFixed(2) : "0.00";

    const prevSales = prevFilteredBookings
      .filter(generatesRevenue)
      .reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
    const prevCount = prevFilteredBookings.length;
    const salesTrend = prevSales > 0 ? Math.round(((totalSales - prevSales) / prevSales) * 100) : 0;
    const bookingsTrend = prevCount > 0 ? Math.round(((totalBookings - prevCount) / prevCount) * 100) : 0;

    return {
      totalSales: totalSales.toFixed(2),
      totalBookings,
      todayBookings,
      todayConfirmed,
      pendingPayment,
      missingRoomNumber,
      cancelledBookings: cancelled,
      cancellationRate,
      averageBasket,
      salesTrend,
      bookingsTrend,
    };
  }, [filteredBookings, prevFilteredBookings, scopedUpcoming, windows.today, rates]);

  // ── Mix clients (hôtel vs externes) ───────────────────────────────
  //
  // « Hôtel » = client logé dans l'établissement ; tout le reste (external et
  // les partenaires staycation / classpass / sezame) compte comme externe.

  const clientMix = useMemo<ClientMixData>(() => {
    const countHotel = (rows: PeriodBooking[]) =>
      rows.filter((b) => normalizeBookingClientType(b.client_type) === "hotel").length;

    const total = filteredBookings.length;
    const hotel = countHotel(filteredBookings);
    const external = total - hotel;

    const prevTotal = prevFilteredBookings.length;
    const prevHotel = countHotel(prevFilteredBookings);
    const prevExternal = prevTotal - prevHotel;

    return {
      total,
      hotel: { count: hotel, share: percentOf(hotel, total), trend: growth(hotel, prevHotel) },
      external: {
        count: external,
        share: percentOf(external, total),
        trend: growth(external, prevExternal),
      },
    };
  }, [filteredBookings, prevFilteredBookings]);

  // ── Canal de réservation (en ligne vs manuel) ─────────────────────

  const bookingChannel = useMemo<BookingChannelData>(() => {
    const countOnline = (rows: PeriodBooking[]) =>
      rows.filter((b) => isOnlineSource(b.source)).length;

    const total = filteredBookings.length;
    const online = countOnline(filteredBookings);
    const manual = total - online;

    const prevTotal = prevFilteredBookings.length;
    const prevOnlineShare = percentOf(countOnline(prevFilteredBookings), prevTotal);
    const onlineShare = percentOf(online, total);
    const delta = prevTotal > 0 ? Math.round(onlineShare - prevOnlineShare) : 0;

    return {
      total,
      online: { count: online, share: onlineShare, shareDelta: delta },
      manual: { count: manual, share: percentOf(manual, total), shareDelta: -delta },
    };
  }, [filteredBookings, prevFilteredBookings]);

  const alerts = useMemo<AlertsData>(() => {
    const toAlertBooking = (b: UpcomingBooking | PaymentAlertBooking): AlertBooking => {
      const bookingDate = parseISO(b.booking_date);
      return {
        id: b.id,
        bookingNumber: b.booking_id,
        date: format(bookingDate, "dd/MM/yyyy"),
        daysUntil: differenceInCalendarDays(bookingDate, new Date()),
        time: b.booking_time,
        hotelName: b.hotel_name,
        amount: formatPrice(toEUR(b.total_price, b.hotel_id)),
      };
    };

    const scopedAlerts = alertRows.filter((b) => matchesHotel(b.hotel_id));

    const pendingPaymentBookings = scopedAlerts
      .filter((b) => b.payment_status === "pending" && b.status !== "cancelled")
      .map(toAlertBooking);

    // « Sans thérapeute » : réservations encore en attente d'attribution, à
    // venir uniquement — le carnet passé n'est plus actionnable.
    const unassignedBookings = scopedUpcoming
      .filter((b) => b.status === "pending")
      .map(toAlertBooking);

    return {
      unassigned: unassignedBookings.length,
      unassignedBookings,
      pendingPayments: pendingPaymentBookings.length,
      pendingPaymentBookings,
      failedPayments: scopedAlerts.filter((b) => b.payment_status === "failed").length,
    };
  }, [alertRows, scopedUpcoming, selectedHotel, rates]);

  const roomOccupancy = useMemo<OccupancyData>(() => {
    const todayBookingsWithRoom = scopedUpcoming.filter(
      (b) =>
        b.booking_date === windows.today &&
        !!b.room_id &&
        ["confirmed", "ongoing", "completed"].includes(b.status)
    );
    const usedRoomIds = new Set(todayBookingsWithRoom.map((b) => b.room_id));

    const totalRooms = selectedHotel === "all"
      ? rooms.length
      : rooms.filter((r) => r.hotel_id === selectedHotel).length;

    return { used: usedRoomIds.size, total: totalRooms };
  }, [scopedUpcoming, rooms, selectedHotel, windows.today]);

  // ── Room occupancy heatmap (today, per room) ──────────────────────
  // Une ligne par salle, une colonne par heure. L'occupation d'un créneau
  // est basée sur la capacité simultanée de la salle : places occupées
  // (somme des guest_count des réservations qui chevauchent) / capacity.

  const roomOccupancyHeatmap = useMemo<RoomOccupancyHeatmap>(() => {
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

    const openingHour = Math.floor(openings.length > 0 ? Math.min(...openings) : 9);
    const closingHour = Math.ceil(closings.length > 0 ? Math.max(...closings) : 20);

    const startHour = Math.max(0, openingHour - 2);
    const endHour = Math.min(24, closingHour + 2);
    const hours: number[] = [];
    for (let h = startHour; h < endHour; h++) hours.push(h);

    const scopedRooms =
      selectedHotel === "all" ? rooms : rooms.filter((r) => r.hotel_id === selectedHotel);

    const hotelNameById = new Map(hotels.map((h) => [h.id, h.name]));

    const todaysBookings = scopedUpcoming.filter(
      (b) =>
        b.booking_date === windows.today &&
        !!b.room_id &&
        ["pending", "confirmed", "ongoing", "completed"].includes(b.status)
    );

    const openHoursCount = Math.max(1, closingHour - openingHour);

    const roomRows: RoomHeatmapRow[] = scopedRooms.map((room) => {
      const capacity = room.capacity && room.capacity > 0 ? room.capacity : 1;
      const roomBookings = todaysBookings.filter((b) => b.room_id === room.id);

      let occupiedSeatHours = 0; // cumul (places occupées, plafonnées) sur les heures d'ouverture
      const cells: RoomHeatmapCell[] = hours.map((h) => {
        const slotStart = h;
        const slotEnd = h + 1;
        let seats = 0;
        roomBookings.forEach((b) => {
          const [bh, bm] = (b.booking_time || "0:0").split(":").map((n) => parseInt(n, 10));
          const bookingStart = (Number.isNaN(bh) ? 0 : bh) + (Number.isNaN(bm) ? 0 : bm) / 60;
          const bookingEnd = bookingStart + (b.duration ?? 60) / 60;
          if (bookingStart < slotEnd && bookingEnd > slotStart) {
            seats += b.guest_count ?? 1;
          }
        });
        const cappedSeats = Math.min(seats, capacity);
        const outOfHours = h < openingHour || h >= closingHour;
        if (!outOfHours) occupiedSeatHours += cappedSeats;
        return {
          hourIndex: h,
          seats,
          capacity,
          rate: Math.min(100, Math.round((seats / capacity) * 100)),
          outOfHours,
        };
      });

      return {
        roomId: room.id,
        roomName: room.name || "Salle",
        hotelId: room.hotel_id ?? "",
        hotelName: (room.hotel_id && hotelNameById.get(room.hotel_id)) || "Lieu inconnu",
        capacity,
        cells,
        dayRate: Math.round((occupiedSeatHours / (capacity * openHoursCount)) * 100),
      };
    });

    // Regroupé par lieu (pour la vue « tous les lieux »), puis par occupation.
    roomRows.sort(
      (a, b) =>
        a.hotelName.localeCompare(b.hotelName) ||
        b.dayRate - a.dayRate ||
        a.roomName.localeCompare(b.roomName),
    );

    return { rooms: roomRows, hours, openingHour, closingHour };
  }, [scopedUpcoming, rooms, hotels, selectedHotel, windows.today]);

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
    const revenueBookings = filteredBookings.filter(generatesRevenue);
    if (revenueBookings.length === 0) return [];

    const prestationCount = (b: PeriodBooking) => (b.booking_treatments || []).length;

    if (days === 0) {
      return Array.from({ length: 8 }, (_, i) => {
        const hour = 9 + i * 2;
        const hourBookings = revenueBookings.filter((b) => {
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
    revenueBookings.forEach((b) => {
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
      .map(([status, value]) => {
        const config = getBookingStatusConfig(status);
        return { name: config.label || status, value, color: config.hexColor, status };
      })
      .sort((a, b) => b.value - a.value);
  }, [filteredBookings]);

  const weekForecast = useMemo<ForecastPoint[]>(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const dayBookings = scopedUpcoming.filter((b) => b.booking_date === dateStr);
      return {
        day: i === 0 ? "Auj." : format(d, "EEE", { locale: fr }),
        confirmed: dayBookings.filter((b) => b.status === "confirmed").length,
        pending: dayBookings.filter((b) => b.status === "pending").length,
      };
    });
  }, [scopedUpcoming]);

  // ── Monthly outlook (fenêtre fixe, indépendante du filtre de période) ──
  // Construit à partir des agrégats calculés par Postgres.
  // rates est une dépendance obligatoire : toEUR en dépend via closure.
  const outlookRows = outlookQ.data ?? EMPTY_OUTLOOK;

  const monthlyOutlook = useMemo<MonthlyOutlookPoint[]>(
    () => buildMonthlyOutlookFromAggregates(outlookRows, { venueId: selectedHotel, toEUR }),
    [outlookRows, selectedHotel, rates, hotelCurrencyMap]
  );

  // Décomposition par lieu — toujours sur tous les lieux (indépendante du
  // filtre de lieu), pour la vue « une ligne par lieu ».
  const monthlyOutlookByVenue = useMemo<MonthlyOutlookByVenue>(
    () =>
      buildMonthlyOutlookByVenueFromAggregates(outlookRows, {
        venues: hotels.map((h) => ({ id: h.id, name: h.name })),
        toEUR,
      }),
    [outlookRows, hotels, rates, hotelCurrencyMap]
  );

  // ── Booking lead time (how far in advance clients book) ───────────
  // Délai = booking_date − created_at (jours calendaires), borné à 0.
  // La source est filtrée sur created_at (réservations FAITES dans la
  // période) et sans borne sur booking_date : une réservation prise hier pour
  // dans un an est justement ce que la métrique mesure.

  const leadTime = useMemo<LeadTimeData>(() => {
    const rows = (leadTimeQ.data ?? EMPTY_LEAD_TIME).filter((b) => matchesHotel(b.hotel_id));

    const leadDays = (b: { booking_date: string; created_at: string | null }) =>
      Math.max(0, differenceInCalendarDays(parseISO(b.booking_date), parseISO(b.created_at!)));

    const withLead = rows.filter((b) => !!b.created_at && !!b.booking_date);
    const globalCount = withLead.length;
    const globalSum = withLead.reduce((s, b) => s + leadDays(b), 0);

    const treatmentMap: Record<string, { sum: number; count: number }> = {};
    withLead.forEach((b) => {
      const days = leadDays(b);
      (b.booking_treatments || []).forEach((bt) => {
        const name = bt.treatment_menus?.name;
        if (!name) return;
        if (!treatmentMap[name]) treatmentMap[name] = { sum: 0, count: 0 };
        treatmentMap[name].sum += days;
        treatmentMap[name].count += 1;
      });
    });

    const byTreatment = Object.entries(treatmentMap)
      .map(([name, { sum, count }]) => ({
        name,
        averageDays: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      averageDays: globalCount > 0 ? Math.round((globalSum / globalCount) * 10) / 10 : 0,
      count: globalCount,
      byTreatment,
    };
  }, [leadTimeQ.data, selectedHotel]);

  const topVenues = useMemo<RankingItem[]>(() => {
    const map: Record<string, RankingItem> = {};
    filteredBookings.filter(generatesRevenue).forEach((b) => {
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
    filteredBookings.filter(generatesRevenue).forEach((b) => {
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
    filteredBookings.filter(generatesRevenue).forEach((b) => {
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
        const totalSales = hb
          .filter(generatesRevenue)
          .reduce((s, b) => s + toEUR(b.total_price, b.hotel_id), 0);
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
    scopeMissing,
    pending,
    hasError,
    hotels,
    stats,
    clientMix,
    bookingChannel,
    alerts,
    roomOccupancy,
    roomOccupancyHeatmap,
    activeTherapists,
    salesChartData,
    statusDistribution,
    weekForecast,
    monthlyOutlook,
    monthlyOutlookByVenue,
    leadTime,
    topVenues,
    topTherapists,
    topTreatments,
    hotelData,
  };
}
