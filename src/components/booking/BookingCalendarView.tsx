import { useMemo, useRef, useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Clock, User, Phone, Euro, Building2, Users, ExternalLink, DoorOpen, CreditCard, Sparkles, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/formatPrice";
import { decodeHtmlEntities, cn } from "@/lib/utils";
import i18n from "@/i18n";
import { useDateLocale } from "@/lib/dateLocale";
import { AvailabilityOverlay } from "./AvailabilityOverlay";
import { CleanupBufferZone } from "./CleanupBufferZone";
import type {
  BookingWithTreatments,
  Hotel,
  DaySummary,
  HourAvailability,
  RoomBlockRow,
  AmenityBookingForCalendar,
} from "@/hooks/booking";
import { getAmenityType } from "@/lib/amenityTypes";
import {
  computeColumnLayout,
  type CalendarLayoutItem,
  type CalendarLayoutSlot,
} from "@/hooks/booking/useCalendarLogic";
import { effectivePaymentStatus } from "@/lib/clientTypePayment";

// Human-readable payment-status labels for the booking hover tooltip.
const PAYMENT_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "admin:bookingCalendar.paymentStatus.pending",
  awaiting_payment: "admin:bookingCalendar.paymentStatus.awaitingPayment",
  paid: "admin:bookingCalendar.paymentStatus.paid",
  failed: "admin:bookingCalendar.paymentStatus.failed",
  refunded: "admin:bookingCalendar.paymentStatus.refunded",
  charged: "admin:bookingCalendar.paymentStatus.charged",
  charged_to_room: "admin:bookingCalendar.paymentStatus.chargedToRoom",
  card_saved: "admin:bookingCalendar.paymentStatus.cardSaved",
  expired: "admin:bookingCalendar.paymentStatus.expired",
  pending_partner_billing: "admin:bookingCalendar.paymentStatus.partnerBilling",
  pending_room_charge: "admin:bookingCalendar.paymentStatus.pendingRoomCharge",
};

// Background colors for the payment-status line in the booking hover tooltip.
const PAYMENT_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  awaiting_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  refunded: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  charged: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  charged_to_room: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  card_saved: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  expired: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending_partner_billing: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  pending_room_charge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

interface BookingCalendarViewProps {
  weekDays: Date[];
  currentWeekStart: Date;
  dayCount: number;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onGoToToday: () => void;
  onSetViewDate: (date: Date) => void;
  getBookingsForDay: (date: Date) => BookingWithTreatments[];
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getCurrentTimePosition: (date: Date) => { showIndicator: boolean; position: number };
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  onCalendarClick: (date: Date, time: string) => void;
  onBookingClick: (booking: BookingWithTreatments) => void;
  hours: number[];
  hourHeight: number;
  startHour: number;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  hotels: Hotel[] | undefined;
  /** Selected venue ids; empty means no venue filter. */
  hotelFilter: string[];
  // Availability overlay (optional — only from VenueBookingCalendar)
  availabilityData?: {
    daySummaries: Map<string, DaySummary>;
    hourAvailability: Map<string, HourAvailability[]>;
  };
  showAvailability?: boolean;
  // Draw the "remise en état" (room turnover) buffer zone under each booking.
  // Hidden when viewing all venues at once to keep the planning readable.
  showCleanupBuffer?: boolean;
  // Réservations de commodité autonomes — celles liées à un booking ne sont pas
  // dessinées ici : le booking les porte déjà (voir placeBooking).
  amenityBookings?: AmenityBookingForCalendar[];
  /** Calendriers visibles : « treatments » + un id par commodité du lieu. */
  visibleCalendars?: Record<string, boolean>;
  /**
   * Réservations de commodité **autonomes** — celles qui n'ont pas de booking
   * derrière (import Hana, saisie directe). Celles rattachées à un booking sont
   * déjà dessinées par la carte du booking : les passer ici les doublerait.
   */
  amenityBookings?: AmenityBookingForCalendar[];
  onAmenityBookingClick?: (booking: AmenityBookingForCalendar) => void;
  /** Blocages ponctuels datés couvrant la plage affichée, tous lieux visibles confondus. */
  roomBlocks?: RoomBlockRow[];
  /** Actions au survol d'une bande. Portent sur cette occurrence seule, pas sur la série. */
  onEditRoomBlock?: (block: RoomBlockRow) => void;
  onDeleteRoomBlock?: (block: RoomBlockRow) => void;
}

// Display the therapist as "Prénom.N" — full first name + initial of last name.
function formatTherapistShort(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lastInitial = parts[parts.length - 1][0].toUpperCase();
    return `${parts[0]}.${lastInitial}`;
  }
  return parts[0];
}

// Display the client's full name — "Prénom Nom".
function formatClientFull(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  return [first, last].filter(Boolean).join(" ");
}

/**
 * Horizontal placement of a card: the day column is split into `bandCount`
 * bands (one per visible calendar), and overlapping cards share their band's
 * width through the column layout.
 */
function horizontalStyleFor(
  layoutInfo: CalendarLayoutSlot | undefined,
  band: number,
  bandCount: number,
) {
  const column = layoutInfo?.column ?? 0;
  const totalColumns = layoutInfo?.totalColumns ?? 1;
  const bands = Math.max(1, bandCount);
  const width = 1 / (totalColumns * bands);
  return {
    left: `calc(${(band / bands + column / (totalColumns * bands)) * 100}% + 2px)`,
    width: `calc(${width * 100}% - 4px)`,
  };
}

/** Compact client name for short/narrow cards — "S.Martin". */
function formatClientCompact(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!last) return first;
  if (!first) return last;
  return `${first[0].toUpperCase()}.${last}`;
}

/** Vertical gap (px) left below a card so consecutive bookings stay distinguishable. */
const CARD_GAP = 3;

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function BookingCalendarView({
  weekDays,
  currentWeekStart,
  dayCount,
  onPreviousWeek,
  onNextWeek,
  onGoToToday,
  onSetViewDate,
  getBookingsForDay,
  getBookingPosition,
  getCurrentTimePosition,
  getStatusColor,
  getTranslatedStatus,
  getCalendarCardColor,
  onCalendarClick,
  onBookingClick,
  hours,
  hourHeight,
  startHour,
  getHotelInfo,
  hotels,
  hotelFilter,
  availabilityData,
  showAvailability,
  showCleanupBuffer = true,
  amenityBookings,
  visibleCalendars,
  amenityBookings,
  onAmenityBookingClick,
  roomBlocks,
  onEditRoomBlock,
  onDeleteRoomBlock,
}: BookingCalendarViewProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const dateLocale = useDateLocale();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= startHour && currentHour < 24) {
        const scrollTo = ((currentHour - startHour - 1) * hourHeight);
        scrollContainerRef.current.scrollTop = Math.max(0, scrollTo);
      }
    }
  }, [startHour, hourHeight]);

  // Should treatment bookings be visible?
  const showTreatments = !visibleCalendars || visibleCalendars["treatments"] !== false;

  /**
   * Réservations de commodité sans booking : les seules encore dessinées comme
   * cartes autonomes. Celles nées d'un booking (linked_booking_id) sont un simple
   * registre de capacité — les dessiner doublerait la réservation sur le créneau.
   */
  const getAmenityBookingsForDay = (day: Date): AmenityBookingForCalendar[] => {
    if (!amenityBookings) return [];
    const dateStr = format(day, "yyyy-MM-dd");
    return amenityBookings.filter((b) => {
      if (b.linked_booking_id) return false;
      if (b.booking_date !== dateStr) return false;
      if (visibleCalendars && visibleCalendars[b.venue_amenity_id] === false) return false;
      return true;
    });
  };

  // Compute position for an amenity booking (same logic as treatment bookings)
  const getAmenityPosition = (booking: AmenityBookingForCalendar): { top: number; height: number } => {
    const [h, m] = booking.booking_time.split(":").map(Number);
    const top = ((h - startHour) + m / 60) * hourHeight;
    const height = Math.max(20, (booking.duration / 60) * hourHeight);
    return { top, height };
  };

  const toAmenityLayoutItem = (booking: AmenityBookingForCalendar): CalendarLayoutItem => {
    const [h, m] = booking.booking_time.split(":").map(Number);
    return {
      id: booking.id,
      startMinutes: h * 60 + m,
      duration: booking.duration > 0 ? booking.duration : 60,
    };
  };

  /**
   * Le calendrier d'une réservation. Une commodité (piscine, sauna…) se réserve
   * comme un soin relié à un venue_amenity, et son amenity_booking lié n'est
   * qu'un registre de capacité : c'est la carte du booking qui la représente.
   *
   * - « Soins » visible → calendrier « Soins », durée complète, y compris pour un
   *   panier 100 % commodité : une réservation reste une réservation ;
   * - « Soins » masqué — c'est ainsi qu'on filtre sur une commodité — → calendrier
   *   de la 1re commodité visible, réduit à la durée de ses accès pour un panier
   *   mixte.
   *
   * Une réservation n'est jamais rendue deux fois : un seul calendrier la porte.
   */
  const placeBooking = (
    booking: BookingWithTreatments,
  ): { calendarId: string; booking: BookingWithTreatments } | null => {
    const lines = booking.treatments ?? [];
    const amenityLines = lines.filter((t) => t.is_amenity && t.amenity_id);

    if (showTreatments) return { calendarId: "treatments", booking };
    if (!amenityLines.length) return null;

    const visible = amenityLines.find(
      (t) => !visibleCalendars || visibleCalendars[t.amenity_id!] !== false,
    );
    if (!visible) return null;

    const amenityDuration = amenityLines
      .filter((t) => t.amenity_id === visible.amenity_id)
      .reduce((sum, t) => sum + (t.duration ?? 0), 0);

    return {
      calendarId: visible.amenity_id!,
      // Copie de travail : la carte occupe le créneau de l'accès, pas celui du panier.
      booking: amenityDuration > 0 ? { ...booking, totalDuration: amenityDuration } : booking,
    };
  };

  /** Les commodités réservées sans booking derrière, pour le jour affiché. */
  const getAmenityBookingsForDay = (day: Date): AmenityBookingForCalendar[] => {
    if (!amenityBookings) return [];
    const dateStr = format(day, "yyyy-MM-dd");
    return amenityBookings.filter((b) => {
      if (b.booking_date !== dateStr) return false;
      if (visibleCalendars && visibleCalendars[b.venue_amenity_id] === false) return false;
      return true;
    });
  };

  const getAmenityPosition = (booking: AmenityBookingForCalendar): { top: number; height: number } => {
    const [h, m] = booking.booking_time.split(":").map(Number);
    const top = ((h - startHour) + m / 60) * hourHeight;
    const height = Math.max(20, (booking.duration / 60) * hourHeight);
    return { top, height };
  };

  const toAmenityLayoutItem = (booking: AmenityBookingForCalendar): CalendarLayoutItem => {
    const [h, m] = booking.booking_time.split(":").map(Number);
    return {
      id: booking.id,
      startMinutes: h * 60 + m,
      duration: booking.duration > 0 ? booking.duration : 60,
    };
  };

  /**
   * Each visible calendar (treatments + one per amenity that has something to
   * draw in the displayed range) gets its own vertical band inside a day, so an
   * amenity is never covered by back-to-back treatments. With a single visible
   * calendar the band spans the whole day column.
   *
   * Une bande n'existe que si elle porte quelque chose : les bookings n'y tombent
   * que « Soins » masqué, les commodités autonomes y sont toujours.
   */
  const amenityCalendarIds = useMemo(() => {
    const ids: string[] = [];
    const add = (id: string) => {
      if (visibleCalendars && visibleCalendars[id] === false) return;
      if (!ids.includes(id)) ids.push(id);
    };
    if (!showTreatments) {
      for (const day of weekDays) {
        for (const b of getBookingsForDay(day)) {
          for (const t of b.treatments ?? []) {
            if (t.is_amenity && t.amenity_id) add(t.amenity_id);
          }
        }
      }
    }
    for (const b of amenityBookings ?? []) add(b.venue_amenity_id);
    return ids;
  }, [weekDays, getBookingsForDay, visibleCalendars, showTreatments, amenityBookings]);

  const bandCount = (showTreatments ? 1 : 0) + amenityCalendarIds.length;
  const bandOf = (calendarId: string) =>
    calendarId === "treatments" ? 0 : (showTreatments ? 1 : 0) + amenityCalendarIds.indexOf(calendarId);

  const getDayLayout = (day: Date) => {
    const placements = getBookingsForDay(day)
      .map(placeBooking)
      .filter((p): p is { calendarId: string; booking: BookingWithTreatments } => p !== null);
    const dayAmenities = getAmenityBookingsForDay(day);

    // Les chevauchements sont résolus band par band, indépendamment. Dans la band
    // d'une commodité, bookings et réservations autonomes se partagent les colonnes.
    const layout = new Map<string, CalendarLayoutSlot>();
    for (const calendarId of ["treatments", ...amenityCalendarIds]) {
      const items: CalendarLayoutItem[] = placements
        .filter((p) => p.calendarId === calendarId)
        .map((p) => toLayoutItem(p.booking));
      if (calendarId !== "treatments") {
        items.push(
          ...dayAmenities.filter((b) => b.venue_amenity_id === calendarId).map(toAmenityLayoutItem),
        );
      }
      computeColumnLayout(items).forEach((slot, id) => layout.set(id, slot));
    }

    // Une commodité autonome partage la bande de son équipement : son créneau
    // doit compter dans les colonnes de cette bande, pas dans celles des soins.
    const amenityLayout = new Map<string, CalendarLayoutSlot>();
    for (const amenityId of amenityCalendarIds) {
      const items = dayAmenities.filter((b) => b.venue_amenity_id === amenityId);
      computeColumnLayout(items.map(toAmenityLayoutItem)).forEach((slot, id) =>
        amenityLayout.set(id, slot),
      );
    }

    return { placements, layout, dayAmenities, amenityLayout };
  };

  // Compute off-hours based on filtered venue or all venues
  const { earliestOpen, latestClose } = useMemo(() => {
    if (!hotels || hotels.length === 0) return { earliestOpen: 7, latestClose: 24 };

    const relevantHotels = hotelFilter.length > 0
      ? hotels.filter(h => hotelFilter.includes(h.id))
      : hotels;

    if (relevantHotels.length === 0) return { earliestOpen: 7, latestClose: 24 };

    const opens = relevantHotels.map(h => parseInt(h.opening_time?.substring(0, 2) || '7'));
    const closes = relevantHotels.map(h => {
      const closeHour = parseInt(h.closing_time?.substring(0, 2) || '24');
      const closeMin = parseInt(h.closing_time?.substring(3, 5) || '0');
      return closeMin > 0 ? closeHour + 1 : closeHour;
    });

    return {
      earliestOpen: Math.min(...opens),
      latestClose: Math.max(...closes),
    };
  }, [hotels, hotelFilter]);

  // ── Blocages ponctuels datés (shooting, maintenance, fermeture) ──────────
  // Ici une colonne = un jour, tous lieux confondus : on ne grise donc pas la
  // colonne entière comme le fait la vue Thérapeutes (mono-lieu), sinon un
  // blocage d'un seul lieu ferait croire que tout le planning est fermé. On
  // pose une bande légendée, sous les réservations.
  const blocksByDate = useMemo(() => {
    const map = new Map<string, RoomBlockRow[]>();
    for (const row of roomBlocks ?? []) {
      const list = map.get(row.block_date) ?? [];
      list.push(row);
      map.set(row.block_date, list);
    }
    return map;
  }, [roomBlocks]);

  // Le nom du lieu n'est utile que lorsque le planning en affiche plusieurs.
  const showBlockVenueName =
    (hotelFilter.length === 0 ? hotels?.length ?? 0 : hotelFilter.length) > 1;

  const renderRoomBlocks = (day: Date) => {
    const rows = blocksByDate.get(format(day, "yyyy-MM-dd"));
    if (!rows || rows.length === 0) return null;

    const gridEndMin = (hours[hours.length - 1] + 1) * 60;
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

    return rows.map((row) => {
      // Un blocage peut déborder de la fenêtre affichée : on le rogne.
      const startMin = Math.max(toMinutes(row.start_time), startHour * 60);
      const endMin = Math.min(toMinutes(row.end_time), gridEndMin);
      if (endMin <= startMin) return null;

      const isWholeVenue = row.room_id === null;
      const venueName = showBlockVenueName ? getHotelInfo(row.hotel_id)?.name : null;
      const details = [row.room_name, venueName].filter(Boolean).join(" · ");

      const hasActions = !!onEditRoomBlock || !!onDeleteRoomBlock;

      return (
        <div
          key={`block-${row.id}`}
          className={cn(
            "group absolute left-0.5 right-0.5 rounded-sm border px-1 py-0.5 overflow-hidden",
            // Sans action câblée la bande reste décorative et laisse passer le
            // clic de création de réservation sur le créneau.
            hasActions ? "cursor-default" : "pointer-events-none",
            isWholeVenue
              ? "bg-red-500/20 border-red-500/45"
              : "bg-amber-500/15 border-amber-500/40"
          )}
          style={{
            top: `${((startMin - startHour * 60) / 60) * hourHeight}px`,
            height: `${((endMin - startMin) / 60) * hourHeight}px`,
          }}
        >
          <span
            className={cn(
              "text-[10px] font-medium leading-tight",
              isWholeVenue ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
            )}
          >
            {row.label}
            {details ? ` · ${details}` : ""}
          </span>

          {hasActions && (
            <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
              {onEditRoomBlock && (
                <button
                  type="button"
                  aria-label={t("planning.editRoomBlock")}
                  title={t("planning.editRoomBlock")}
                  // h/w figés + min-h-0 : sans ça la règle globale min-height:44px
                  // (cible tactile) étire le bouton en ovale dans la bande.
                  className="flex h-5 w-5 min-h-0 shrink-0 items-center justify-center rounded-md bg-background/85 hover:bg-background text-foreground/70 hover:text-foreground p-0 shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRoomBlock(row);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onDeleteRoomBlock && (
                <button
                  type="button"
                  aria-label={t("planning.deleteRoomBlock")}
                  title={t("planning.deleteRoomBlock")}
                  className="flex h-5 w-5 min-h-0 shrink-0 items-center justify-center rounded-md bg-background/85 hover:bg-background text-destructive/80 hover:text-destructive p-0 shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRoomBlock(row);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (dayCount === 1) {
      return format(currentWeekStart, "EEEE d MMMM yyyy", { locale: dateLocale });
    }
    const endDate = addDays(currentWeekStart, dayCount - 1);
    const sameMonth = format(currentWeekStart, 'MM') === format(endDate, 'MM');
    if (sameMonth) {
      return `${format(currentWeekStart, "d", { locale: dateLocale })} - ${format(endDate, "d MMMM yyyy", { locale: dateLocale })}`;
    }
    return `${format(currentWeekStart, "d MMM", { locale: dateLocale })} - ${format(endDate, "d MMM yyyy", { locale: dateLocale })}`;
  }, [currentWeekStart, dayCount, dateLocale]);

  const gridTemplateColumns = `48px repeat(${dayCount}, 1fr)`;
  const gridTemplateColumnsMd = `52px repeat(${dayCount}, 1fr)`;

  return (
    <div className="p-2 md:p-3 flex flex-col h-full overflow-hidden">
      {/* Navigation bar */}
      <div className="flex items-center justify-between mb-1 gap-2 flex-shrink-0">
        {/* Left: today */}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-medium" onClick={onGoToToday}>
          {t("common:dates.today")}
        </Button>

        {/* Center: nav arrows autour de la plage de dates → mini calendar popover */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-sm hover:bg-muted px-3 py-1 rounded-md transition-colors cursor-pointer capitalize">
                {dateRangeLabel}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentWeekStart}
                onSelect={(date) => {
                  if (date) onSetViewDate(date);
                }}
                locale={dateLocale}
                weekStartsOn={1}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

      </div>

      {/* Calendar grid */}
      <div className="w-full -mx-2 md:mx-0 px-2 md:px-0 flex-1 flex flex-col min-h-0">
        <div className="min-w-[600px] md:min-w-0 w-full bg-card rounded-lg border border-border flex flex-col h-full overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Header with days */}
            <TooltipProvider>
            <div
              className="sticky top-0 z-20 border-b border-border bg-card hidden md:grid"
              style={{ gridTemplateColumns: gridTemplateColumnsMd }}
            >
              <div className="px-2 py-1.5 border-r border-border bg-muted flex items-center">
                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">{t("bookingCalendar.hourColumn")}</span>
              </div>
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "px-2 py-1.5 border-r border-border last:border-r-0 bg-muted flex items-center justify-center gap-1.5",
                      isToday && "ring-1 ring-inset ring-primary/20"
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: dateLocale })}
                    </span>
                    <span className={cn("text-sm font-bold", isToday && "text-primary")}>
                      {format(day, "d")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(day, "MMM", { locale: dateLocale })}
                    </span>
                    {showAvailability && availabilityData && (() => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const summary = availabilityData.daySummaries.get(dateStr);
                      if (!summary) return null;
                      const count = summary.availableTherapistCount;
                      const total = summary.totalTherapistCount;
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5",
                              count === 0 && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                              count === 1 && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                              count >= 2 && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                            )}>
                              <Users className="h-2.5 w-2.5" />
                              {count}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <div className="text-xs">
                              <div className="font-medium">{t("bookingCalendar.therapistsAvailable", { count, total })}</div>
                              {summary.coverageGaps.length > 0 && (
                                <div className="text-muted-foreground mt-1">
                                  {t("bookingCalendar.coverageGaps", { gaps: summary.coverageGaps.join(", ") })}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            </TooltipProvider>

            {/* Mobile header */}
            <div
              className="sticky top-0 z-20 border-b border-border bg-card grid md:hidden"
              style={{ gridTemplateColumns }}
            >
              <div className="p-1 border-r border-border bg-muted">
                <span className="text-[10px] font-medium text-muted-foreground">{t("bookingCalendar.hourColumn")}</span>
              </div>
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-1 text-center border-r border-border last:border-r-0 bg-muted",
                      isToday && "ring-1 ring-inset ring-primary/20"
                    )}
                  >
                    <div className="text-[10px] font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: dateLocale })}
                    </div>
                    <div className={cn("text-sm font-bold", isToday && "text-primary")}>
                      {format(day, "d")}
                    </div>
                    <div className="text-[8px] text-muted-foreground">
                      {format(day, "MMM", { locale: dateLocale })}
                    </div>
                    {showAvailability && availabilityData && (() => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const summary = availabilityData.daySummaries.get(dateStr);
                      if (!summary) return null;
                      const count = summary.availableTherapistCount;
                      return (
                        <div className={cn(
                          "mt-0.5 text-[8px] font-medium px-1 py-0.5 rounded-full inline-flex items-center gap-0.5",
                          count === 0 && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                          count === 1 && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                          count >= 2 && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                        )}>
                          <Users className="h-2 w-2" />
                          {count}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {/* Time slots grid - Desktop */}
            <div className="hidden md:grid" style={{ gridTemplateColumns: gridTemplateColumnsMd }}>
              {/* Hours column */}
              <div className="border-r border-border bg-muted/20">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border p-0.5 flex items-start justify-center"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const { placements, layout: dayLayout, dayAmenities, amenityLayout } = getDayLayout(day);
                const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn("relative border-r border-border last:border-r-0", isToday && "bg-primary/[0.02]")}
                  >
                    {/* Grid lines for each hour */}
                    {hours.map((hour) => {
                      const isOutsideHours = hour < earliestOpen || hour >= latestClose;
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "border-b border-border transition-colors",
                            isOutsideHours
                              ? "bg-muted/40 cursor-default"
                              : cn(
                                  hour % 2 !== 0 ? "bg-muted/10" : "",
                                  "cursor-pointer hover:bg-primary/10"
                                )
                          )}
                          style={{ height: `${hourHeight}px` }}
                          onClick={() => !isOutsideHours && onCalendarClick(day, hourStr)}
                        />
                      );
                    })}

                    {/* Blocages ponctuels datés — sous les réservations */}
                    {renderRoomBlocks(day)}

                    {/* Availability overlay */}
                    {showAvailability && availabilityData && (
                      <AvailabilityOverlay
                        hourAvailability={availabilityData.hourAvailability.get(format(day, "yyyy-MM-dd")) || []}
                        hours={hours}
                        hourHeight={hourHeight}
                        startHour={startHour}
                      />
                    )}

                    {/* Positioned bookings — chacune dans le calendrier qui la porte */}
                    <TooltipProvider>
                      {placements.map(({ booking, calendarId }) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          layoutInfo={dayLayout.get(booking.id)}
                          band={bandOf(calendarId)}
                          bandCount={bandCount}
                          getBookingPosition={getBookingPosition}
                          getCalendarCardColor={getCalendarCardColor}
                          getStatusColor={getStatusColor}
                          getTranslatedStatus={getTranslatedStatus}
                          getHotelInfo={getHotelInfo}
                          onBookingClick={onBookingClick}
                          navigate={navigate}
                          showCleanupBuffer={showCleanupBuffer}
                        />
                      ))}
                      {/* Commodités réservées sans booking derrière */}
                      {dayAmenities.map((ab) => (
                        <AmenityBookingCard
                          key={ab.id}
                          booking={ab}
                          position={getAmenityPosition(ab)}
                          layoutInfo={amenityLayout.get(ab.id)}
                          band={bandOf(ab.venue_amenity_id)}
                          bandCount={bandCount}
                          onClick={onAmenityBookingClick}
                        />
                      ))}
                    </TooltipProvider>

                    {/* Reservations de commodite sans booking associe */}
                    {dayAmenities.map((ab) => (
                      <AmenityBookingCard
                        key={ab.id}
                        booking={ab}
                        position={getAmenityPosition(ab)}
                        layoutInfo={dayLayout.get(ab.id)}
                        band={bandOf(ab.venue_amenity_id)}
                        bandCount={bandCount}
                        onClick={onAmenityBookingClick}
                      />
                    ))}

                    {/* Current time indicator */}
                    {showIndicator && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                        style={{ top: `${currentTimeTop}px` }}
                      >
                        <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-destructive rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time slots grid - Mobile */}
            <div className="grid md:hidden" style={{ gridTemplateColumns }}>
              {/* Hours column */}
              <div className="border-r border-border bg-muted/20 w-[48px]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border p-0.5 flex items-start justify-center"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const { placements, layout: dayLayout, dayAmenities, amenityLayout } = getDayLayout(day);
                const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn("relative border-r border-border last:border-r-0", isToday && "bg-primary/[0.02]")}
                  >
                    {hours.map((hour) => {
                      const isOutsideHours = hour < earliestOpen || hour >= latestClose;
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "border-b border-border transition-colors",
                            isOutsideHours
                              ? "bg-muted/40 cursor-default"
                              : cn(
                                  hour % 2 !== 0 ? "bg-muted/10" : "",
                                  "cursor-pointer hover:bg-primary/10"
                                )
                          )}
                          style={{ height: `${hourHeight}px` }}
                          onClick={() => !isOutsideHours && onCalendarClick(day, hourStr)}
                        />
                      );
                    })}

                    {/* Blocages ponctuels datés — sous les réservations */}
                    {renderRoomBlocks(day)}

                    {/* Availability overlay */}
                    {showAvailability && availabilityData && (
                      <AvailabilityOverlay
                        hourAvailability={availabilityData.hourAvailability.get(format(day, "yyyy-MM-dd")) || []}
                        hours={hours}
                        hourHeight={hourHeight}
                        startHour={startHour}
                      />
                    )}

                    <TooltipProvider>
                      {placements.map(({ booking, calendarId }) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          layoutInfo={dayLayout.get(booking.id)}
                          band={bandOf(calendarId)}
                          bandCount={bandCount}
                          getBookingPosition={getBookingPosition}
                          getCalendarCardColor={getCalendarCardColor}
                          getStatusColor={getStatusColor}
                          getTranslatedStatus={getTranslatedStatus}
                          getHotelInfo={getHotelInfo}
                          onBookingClick={onBookingClick}
                          navigate={navigate}
                          showCleanupBuffer={showCleanupBuffer}
                        />
                      ))}
                      {/* Commodités réservées sans booking derrière */}
                      {dayAmenities.map((ab) => (
                        <AmenityBookingCard
                          key={ab.id}
                          booking={ab}
                          position={getAmenityPosition(ab)}
                          layoutInfo={amenityLayout.get(ab.id)}
                          band={bandOf(ab.venue_amenity_id)}
                          bandCount={bandCount}
                          onClick={onAmenityBookingClick}
                        />
                      ))}
                    </TooltipProvider>

                    {/* Reservations de commodite sans booking associe */}
                    {dayAmenities.map((ab) => (
                      <AmenityBookingCard
                        key={ab.id}
                        booking={ab}
                        position={getAmenityPosition(ab)}
                        layoutInfo={dayLayout.get(ab.id)}
                        band={bandOf(ab.venue_amenity_id)}
                        bandCount={bandCount}
                        onClick={onAmenityBookingClick}
                      />
                    ))}

                    {showIndicator && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                        style={{ top: `${currentTimeTop}px` }}
                      >
                        <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-destructive rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Extracted booking card component for cleaner code
export function BookingCard({
  booking,
  layoutInfo,
  band,
  bandCount,
  getBookingPosition,
  getCalendarCardColor,
  getStatusColor,
  getTranslatedStatus,
  getHotelInfo,
  onBookingClick,
  navigate,
  showCleanupBuffer = true,
}: {
  booking: BookingWithTreatments;
  layoutInfo?: CalendarLayoutSlot;
  /** Index of the calendar band this card belongs to, and how many bands the day has. */
  band: number;
  bandCount: number;
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  onBookingClick: (booking: BookingWithTreatments) => void;
  navigate: ReturnType<typeof useNavigate>;
  showCleanupBuffer?: boolean;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const { top, height } = getBookingPosition(booking);
  const hotelInfo = getHotelInfo(booking.hotel_id);

  const duration = booking.duration && booking.duration > 0
    ? booking.duration
    : (booking.totalDuration && booking.totalDuration > 0
      ? booking.totalDuration
      : 60);
  const treatments = booking.treatments || [];
  const durationHours = Math.floor(duration / 60);
  const durationMinutes = duration % 60;
  const durationFormatted = durationHours > 0
    ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
    : `${durationMinutes}min`;
  const totalPrice = booking.total_price && booking.total_price > 0
    ? booking.total_price
    : (booking.treatmentsTotalPrice || 0);

  const therapistShort = formatTherapistShort(booking.therapist_name);
  const clientName = formatClientFull(booking.client_first_name, booking.client_last_name);
  const treatmentsLabel = treatments.map((tr) => tr.name).filter(Boolean).join(", ");

  // Duo booking: one row needing several practitioners (guest_count > 1).
  const guestCount = booking.guest_count ?? 1;
  const isDuo = guestCount > 1;
  const acceptedTherapistCount = (booking.booking_therapists ?? []).filter(
    (bt) => bt.status === "accepted",
  ).length;
  const therapistNames = booking.therapist_display_names ?? [];
  // A duo names every accepted practitioner on the card ("Marie.L + Florence.S");
  // a solo keeps the primary therapist. Falls back to the primary while a duo is
  // still being staffed and no accepted name is resolved yet.
  const therapistLabel =
    isDuo && therapistNames.length > 0
      ? therapistNames.map(formatTherapistShort).join(" + ")
      : therapistShort;
  const therapistTitle =
    isDuo && therapistNames.length > 0
      ? therapistNames.join(", ")
      : booking.therapist_name || "";
  const hasTherapist = !!therapistLabel;

  // Panier 100 % commodité : aucune salle de soin n'est mobilisée, la ligne
  // « cabine » n'a rien à afficher. On la remplace par l'équipement réservé.
  const amenityLine = treatments.find((t) => t.is_amenity);
  const isAmenityOnly = treatments.length > 0 && treatments.every((t) => t.is_amenity);
  const AmenityIcon = amenityLine?.amenity_type
    ? getAmenityType(amenityLine.amenity_type)?.icon
    : undefined;

  // Small payment tag — "Payé" once settled by card/cash, "Facturé chambre" when
  // charged to the hotel room. Mirrors the canonical payment_status logic used
  // across the app (BookingDetail / CustomerBookingsTab).
  // Statut affiché : une facturation partenaire est stockée "paid" mais reste
  // présentée comme "Paiement partenaire".
  const displayPaymentStatus = booking.payment_status
    ? effectivePaymentStatus(booking.payment_method, booking.payment_status)
    : null;

  const paymentTag =
    displayPaymentStatus === 'paid'
      ? { label: t('bookingCalendar.paymentStatus.paid'), className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800' }
      : displayPaymentStatus === 'charged_to_room'
        ? { label: t('bookingCalendar.paymentStatus.chargedToRoom'), className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800' }
        : null;

  // Full payment-status label + background color for the hover tooltip.
  const paymentStatusKey = displayPaymentStatus
    ? PAYMENT_STATUS_LABEL_KEYS[displayPaymentStatus]
    : undefined;
  const paymentStatusLabel = displayPaymentStatus
    ? (paymentStatusKey ? t(paymentStatusKey) : displayPaymentStatus)
    : null;
  const paymentStatusClass = displayPaymentStatus
    ? PAYMENT_STATUS_CLASSES[displayPaymentStatus] ?? 'bg-muted text-foreground'
    : 'bg-muted text-foreground';

  // Show each detail row only when it fully fits, so nothing is half-clipped.
  // Budget: 4px padding + 17px time row, then one 15px row each.
  const showClientRow = !!clientName && height >= 40;
  const showTherapistRow = hasTherapist && height >= 56;
  const showTreatmentRow = !!treatmentsLabel && height >= 72;
  const showRoomRow = !isAmenityOnly && !!booking.room_name && height >= 88;
  const showAmenityRow = isAmenityOnly && !!amenityLine?.amenity_name && height >= 88;
  // When the client doesn't get its own row, keep it visible inline next to the time.
  const showInlineClient = !!clientName && !showClientRow;

  // Horizontal placement shared by the booking card and its cleanup buffer zone.
  const horizontalStyle = horizontalStyleFor(layoutInfo, band, bandCount);

  return (
    <>
      {showCleanupBuffer && booking.status !== 'cancelled' && (
        <CleanupBufferZone
          bufferMinutes={hotelInfo?.room_turnover_buffer_minutes ?? 0}
          bookingTop={top}
          bookingHeight={height}
          roomName={booking.room_name}
          style={horizontalStyle}
        />
      )}
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute rounded text-sm cursor-pointer overflow-hidden z-10 border-l-4 group",
            // Background always reflects the reservation-flow stage (status + payment).
            // The venue color (if any) is shown as the left bar only — see below.
            getCalendarCardColor(booking.status, booking.payment_status)
          )}
          style={{
            ...(hotelInfo?.calendar_color && {
              borderLeftColor: hotelInfo.calendar_color,
            }),
            top: `${top}px`,
            // A few pixels shorter than the real slot so two back-to-back
            // bookings read as two blocks instead of one solid band.
            height: `${Math.max(18, height - CARD_GAP)}px`,
            minHeight: '18px',
            ...horizontalStyle,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onBookingClick(booking);
          }}
        >
          <div className="px-1 py-0.5 h-full flex flex-col gap-0 relative leading-none">
            {/* Time range (+ out-of-hours indicator, + inline client on short cards) */}
            <div className="flex items-center gap-1 min-w-0 h-[17px]">
              <span className="font-medium text-[14px] flex-shrink-0 whitespace-nowrap">
                {booking.booking_time
                  ? `${booking.booking_time.substring(0, 5)} – ${addMinutesToTime(booking.booking_time, duration)}`
                  : ""}
              </span>
              {booking.is_out_of_hours && (
                <span className="flex items-center flex-shrink-0" title={t("bookingColumns.badges.outOfHours")}>
                  <Clock className="h-2.5 w-2.5 text-amber-500" />
                </span>
              )}
              {isDuo && (
                <span
                  className="flex items-center gap-0.5 flex-shrink-0 px-1 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  title={t("bookingCalendar.duoTooltip", { accepted: acceptedTherapistCount, total: guestCount })}
                >
                  <Users className="h-2 w-2" />
                  {t("bookingCalendar.duoBadge", { accepted: acceptedTherapistCount, total: guestCount })}
                </span>
              )}
              {showInlineClient && (
                <span className="truncate text-[12px] opacity-90 font-medium min-w-0" title={clientName}>
                  {clientName}
                </span>
              )}
            </div>
            {/* Stacked details (therapist · client · room), each with its icon.
                Each row renders only when it fully fits (see flags above). */}
            {showClientRow && (
              <div className="flex items-center gap-1 text-[12px] font-medium opacity-90 min-w-0 h-[15px]" title={clientName}>
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{clientName}</span>
              </div>
            )}
            {showTherapistRow && (
              <div className="flex items-center gap-1 text-[12px] font-medium text-foreground/80 min-w-0 h-[15px]">
                <Users className="h-3 w-3 flex-shrink-0" />
                <span className="truncate" title={therapistTitle}>
                  {therapistLabel}
                </span>
                {booking.therapist_id && (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-3 w-3 flex items-center justify-center rounded-full hover:bg-foreground/10 flex-shrink-0 ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/therapists/${booking.therapist_id}`);
                    }}
                    title={t("bookingCalendar.openTherapist")}
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            )}
            {showTreatmentRow && (
              <div className="flex items-center gap-1 text-[12px] font-medium opacity-90 min-w-0 h-[15px]" title={treatmentsLabel}>
                <Sparkles className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{treatmentsLabel}</span>
              </div>
            )}
            {showRoomRow && (
              <div className="flex items-center gap-1 text-[12px] font-medium opacity-90 min-w-0 h-[15px]" title={booking.room_name || ""}>
                <DoorOpen className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{booking.room_name}</span>
              </div>
            )}
            {showAmenityRow && (
              <div className="flex items-center gap-1 text-[12px] font-medium opacity-90 min-w-0 h-[15px]" title={amenityLine!.amenity_name || ""}>
                {AmenityIcon && <AmenityIcon className="h-3 w-3 flex-shrink-0" />}
                <span className="truncate">{amenityLine!.amenity_name}</span>
              </div>
            )}
            {/* Payment tag — bottom-left, in flow so it never overlaps the rows above */}
            {paymentTag && (
              <div
                className={cn(
                  // Kept in flow right under the detail rows: pinning it to the
                  // bottom left a large empty gap and clipped the tag on short cards.
                  "mt-0.5 self-start px-1.5 h-4 rounded-[3px] flex items-center text-[8px] font-bold flex-shrink-0 border shadow-sm whitespace-nowrap max-w-[70%] truncate",
                  // Reserve room on the right for the absolute "À ASSIGNER" badge when present.
                  !hasTherapist && !isAmenityOnly && "mr-16",
                  paymentTag.className
                )}
                title={paymentTag.label}
              >
                {paymentTag.label}
              </div>
            )}
            {/* Unassigned badge — bottom-right corner.
                Panier 100 % commodité : aucun thérapeute n'est attendu. */}
            {!hasTherapist && !isAmenityOnly && (
              <div
                className="absolute bottom-1 right-1 px-1.5 h-4 rounded-[3px] flex items-center justify-center text-[8px] font-bold flex-shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800 shadow-sm"
                title={t("bookingCalendar.unassignedTooltip")}
              >
                {t("bookingCalendar.unassignedBadge")}
              </div>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm z-50">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">
              {t("bookingCalendar.bookingNumber", { number: booking.booking_id })}
            </div>
            <Badge className={`text-[8px] ${getStatusColor(booking.status)}`}>
              {getTranslatedStatus(booking.status)}
            </Badge>
            {isDuo && (
              <Badge className="text-[8px] gap-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                <Users className="h-2.5 w-2.5" />
                {t("bookingCalendar.duoBadge", { accepted: acceptedTherapistCount, total: guestCount })}
              </Badge>
            )}
          </div>

          {booking.hotel_name && (
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3 w-3" />
              <span>{booking.hotel_name}</span>
            </div>
          )}

          {booking.room_number && (
            <div className="text-xs">
              {t("bookingCalendar.roomNumber", { number: decodeHtmlEntities(booking.room_number) })}
            </div>
          )}

          {!isAmenityOnly && booking.room_name && (
            <div className="flex items-center gap-2 text-xs">
              <DoorOpen className="h-3 w-3" />
              <span>
                {t("bookingCalendar.treatmentRoom", { name: booking.room_name })}
                {booking.secondary_room_name && ` + ${booking.secondary_room_name}`}
              </span>
            </div>
          )}

          {isAmenityOnly && amenityLine?.amenity_name && (
            <div className="flex items-center gap-2 text-xs">
              {AmenityIcon && <AmenityIcon className="h-3 w-3" />}
              <span>{amenityLine.amenity_name}</span>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <User className="h-3 w-3" />
              <span>{formatClientFull(booking.client_first_name, booking.client_last_name)}</span>
            </div>
            {booking.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{booking.phone}</span>
              </div>
            )}
          </div>

          {isDuo ? (
            <div className="flex items-start gap-2 text-xs">
              <Users className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                {t("bookingCalendar.therapistsLabel")}{" "}
                {therapistNames.length > 0
                  ? therapistNames.join(", ")
                  : t("bookingCalendar.assignedCount", { accepted: acceptedTherapistCount, total: guestCount })}
              </span>
            </div>
          ) : (
            booking.therapist_name && (
              <div className="flex items-center gap-2 text-xs">
                <Users className="h-3 w-3" />
                <span>{t("bookingCalendar.therapistLabel", { name: booking.therapist_name })}</span>
              </div>
            )
          )}

          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" />
            <span>{t("bookingCalendar.durationLabel", { value: durationFormatted })}</span>
          </div>

          {(() => {
            const allOnQuote = treatments.length > 0 && treatments.every(
              (tr) => (!tr.price || tr.price === 0) && (!tr.duration || tr.duration === 0)
            );

            if (allOnQuote) {
              return (
                <div className="text-xs text-muted-foreground italic">
                  {t("bookingCalendar.onQuote")}
                </div>
              );
            }

            if (treatments.length > 0) {
              return (
                <div className="space-y-1">
                  <div className="text-xs font-medium">{t("bookingCalendar.treatmentsLabel")}</div>
                  <ul className="text-xs space-y-1">
                    {treatments.map((treatment, idx) => {
                      const tHours = Math.floor((treatment.duration || 0) / 60);
                      const tMinutes = (treatment.duration || 0) % 60;
                      const tDurationFormatted = `${tHours.toString().padStart(2, '0')}h${tMinutes.toString().padStart(2, '0')}`;
                      return (
                        <li key={idx} className="flex justify-between gap-2">
                          <span>{treatment.name}</span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {tDurationFormatted} • {formatPrice(treatment.price || 0, hotelInfo?.currency || 'EUR')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }

            return null;
          })()}

          <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
            <Euro className="h-3 w-3" />
            <span>{t("bookingCalendar.totalLabel", { value: formatPrice(totalPrice, hotelInfo?.currency || 'EUR') })}</span>
          </div>

          {paymentStatusLabel && (
            <div className={cn("flex items-center gap-2 text-xs font-medium rounded px-2 py-1", paymentStatusClass)}>
              <CreditCard className="h-3 w-3 flex-shrink-0" />
              <span>{t("bookingCalendar.paymentLabel", { value: paymentStatusLabel })}</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
    </>
  );
}

function AmenityBookingCard({
  booking,
  position,
  layoutInfo,
  band,
  bandCount,
  onClick,
}: {
  booking: AmenityBookingForCalendar;
  position: { top: number; height: number };
  layoutInfo?: CalendarLayoutSlot;
  /** Index of the calendar band this card belongs to, and how many bands the day has. */
  band: number;
  bandCount: number;
  onClick?: (booking: AmenityBookingForCalendar) => void;
}) {
  const { top, height } = position;
  const typeDef = getAmenityType(booking.amenity_type);
  const Icon = typeDef?.icon;

  // Detect when the card is too narrow to fit info on a single row,
  // and stack the contents vertically (single column) instead.
  const cardRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsNarrow(width < 80);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const durationHours = Math.floor(booking.duration / 60);
  const durationMinutes = booking.duration % 60;
  const durationFormatted = durationHours > 0
    ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
    : `${durationMinutes}min`;

  const clientName = booking.customer
    ? `${booking.customer.first_name} ${booking.customer.last_name || ""}`.trim()
    : "";

  // A narrow band can't fit "Sophie Martin" — the client is still the key info
  // there, so abbreviate the first name instead of dropping it. Short cards keep
  // the full name: the rows are tight enough for it to fit on a 30-min slot.
  const clientNameOnCard = isNarrow
    ? formatClientCompact(booking.customer?.first_name, booking.customer?.last_name)
    : clientName;

  const clientTypeBadge = {
    external: "Ext",
    internal: "Int",
    lymfea: "Lym",
  }[booking.client_type];

  const horizontalStyle = horizontalStyleFor(layoutInfo, band, bandCount);

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          ref={cardRef}
          className="absolute rounded text-sm overflow-hidden border-l-4 group transition-opacity z-[5] cursor-pointer hover:opacity-90"
          style={{
            borderLeftColor: booking.amenity_color,
            backgroundColor: booking.amenity_color + "22",
            top: `${top}px`,
            height: `${Math.max(18, height - CARD_GAP)}px`,
            minHeight: "18px",
            ...horizontalStyle,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(booking);
          }}
        >
          <div className="px-1 py-0.5 h-full flex flex-col gap-0 leading-none">
            <div
              className={cn(
                "flex gap-0.5",
                isNarrow
                  ? "flex-col items-start"
                  : "flex-row items-center justify-between h-[16px]"
              )}
            >
              <div className="font-bold text-[13px]" style={{ color: booking.amenity_color }}>
                {booking.booking_time?.substring(0, 5)}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {Icon && (
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: booking.amenity_color + "25" }}
                  >
                    <Icon className="h-2.5 w-2.5" style={{ color: booking.amenity_color }} />
                  </div>
                )}
              </div>
            </div>
            {/* Client name is always shown — it's the first thing staff look for. */}
            <div className="truncate text-[12px] font-medium h-[14px] flex items-center" title={clientName}>
              {clientNameOnCard || booking.amenity_name}
            </div>
            {height >= 46 && (
              <div
                className={cn(
                  "flex text-[12px] font-semibold opacity-80",
                  isNarrow
                    ? "flex-col items-start"
                    : "flex-row items-center gap-1 h-[14px]"
                )}
              >
                <span>{durationFormatted}</span>
                {!isNarrow && <span>·</span>}
                <span>{booking.num_guests}/{booking.capacity_total}</span>
              </div>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <AmenityTooltipContent
        booking={booking}
        Icon={Icon}
        clientName={clientName}
        clientTypeBadge={clientTypeBadge}
        durationFormatted={durationFormatted}
      />
    </Tooltip>
  );
}

/** Hover details for an amenity booking. */
function AmenityTooltipContent({
  booking,
  Icon,
  clientName,
  clientTypeBadge,
  durationFormatted,
}: {
  booking: AmenityBookingForCalendar;
  Icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  clientName: string;
  clientTypeBadge?: string;
  durationFormatted: string;
}) {
  return (
    <TooltipContent side="right" className="max-w-sm z-50">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" style={{ color: booking.amenity_color }} />}
          <span className="font-semibold text-sm">{booking.amenity_name}</span>
          <Badge variant="secondary" className="text-[8px]">{clientTypeBadge}</Badge>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-xs">
            <User className="h-3 w-3" />
            <span>{clientName}</span>
          </div>
        )}
        {booking.room_number && (
          <div className="text-xs">Chambre: {booking.room_number}</div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3 w-3" />
          <span>{booking.booking_time?.substring(0, 5)} · {durationFormatted}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Users className="h-3 w-3" />
          <span>{booking.num_guests} / {booking.capacity_total} personnes</span>
        </div>
        {booking.price > 0 && (
          <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
            <Euro className="h-3 w-3" />
            <span>{formatPrice(booking.price, "EUR")}</span>
          </div>
        )}
        {booking.notes && (
          <div className="text-xs text-muted-foreground italic">{booking.notes}</div>
        )}
      </div>
    </TooltipContent>
  );
}
