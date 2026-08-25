import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, subDays, startOfMonth, endOfMonth, format, parseISO, isValid } from "date-fns";
import { Ban, ChevronDown, LayoutGrid, RefreshCw, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/AppLoader";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { BookingDetailDialog } from "@/components/admin/details/BookingDetailDialog";
import { RoomBlockDialog } from "@/components/admin/venue/RoomBlockDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useUserContext } from "@/hooks/useUserContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { useCurrentVenueId } from "@/hooks/useCurrentVenueId";
import { useOverflowControl } from "@/hooks/useOverflowControl";

import { useTranslation } from "react-i18next";
import {
  useBookingData,
  useBookingFilters,
  useCalendarLogic,
  useBookingSelection,
  useAmenityBookingData,
  useTherapistDayPlanning,
  useRoomBlocks,
  useDeleteRoomBlockRow,
  type RoomBlockRow,
  type BookingWithTreatments,
  type AmenityBookingForCalendar,
} from "@/hooks/booking";

import {
  BookingFilters,
  BookingCalendarView,
  BookingListView,
  TherapistDayView,
  SendPaymentLinkDialog,
} from "@/components/booking";
import { ALL_TREATMENTS } from "@/components/booking/TherapistDayView";
import { TreatmentCoverageDialog } from "@/components/booking/TreatmentCoverageDialog";
import type { PlanningMode } from "@/components/booking/BookingFilters";
import { useVenueTreatmentMenus } from "@/hooks/useVenueTreatmentMenus";
import { CancelBookingDialog } from "@/components/booking/CancelBookingDialog";
import {
  CalendarSidebarDesktop,
  CalendarSidebarMobile,
  buildCalendarEntries,
} from "@/components/booking/CalendarSidebar";
import { useVenueAmenities } from "@/hooks/useVenueAmenities";
import { CreateAmenityBookingDialog } from "@/components/booking/CreateAmenityBookingDialog";
import { AmenityBookingDetailDialog } from "@/components/booking/AmenityBookingDetailDialog";

export default function Booking() {
  const navigate = useNavigate();
  const { isAdmin } = useUserContext();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const { activeTimezone } = useTimezone();
  const { t, i18n } = useTranslation(["admin", "common"]);
  
  // AJOUT : Récupération des paramètres de recherche de l'URL
  const [searchParams] = useSearchParams();

  // Day count with localStorage persistence (declared before the data fetch so
  // the date window can account for how many days are visible).
  const [dayCount, setDayCount] = useState<number>(() => {
    const saved = localStorage.getItem('planning-day-count');
    return saved ? Number(saved) : 5;
  });

  useEffect(() => {
    localStorage.setItem('planning-day-count', String(dayCount));
  }, [dayCount]);

  // Layout of the planning: days side by side, or one column per therapist.
  const [planningMode, setPlanningMode] = useState<PlanningMode>(() =>
    localStorage.getItem('planning-mode') === 'therapists' ? 'therapists' : 'day',
  );

  useEffect(() => {
    localStorage.setItem('planning-mode', planningMode);
  }, [planningMode]);

  // Therapist mode: hide people who aren't working that day (Fresha's "scheduled team").
  const [showOnlyScheduled, setShowOnlyScheduled] = useState<boolean>(
    () => localStorage.getItem('planning-scheduled-team') !== 'false',
  );

  useEffect(() => {
    localStorage.setItem('planning-scheduled-team', String(showOnlyScheduled));
  }, [showOnlyScheduled]);

  // "Who can take this treatment?" — drives qualification + required duration.
  const [searchedTreatmentId, setSearchedTreatmentId] = useState<string>(ALL_TREATMENTS);

  // Lecture inverse du planning : prestations × jours. Indépendante du filtre de lieu.
  const [isCoverageOpen, setIsCoverageOpen] = useState(false);

  // Sliding date window: only load bookings around the period the calendar shows
  // (same `?date=` source as useCalendarLogic), instead of the whole org history.
  // Snap to month bounds + a generous buffer so navigating a week or two stays
  // within the already-cached window (the queryKey — hence the fetch — is stable
  // until you scroll out of range).
  const { fromDate, toDate } = useMemo(() => {
    const raw = searchParams.get("date");
    const parsed = raw ? parseISO(raw) : null;
    const base = parsed && isValid(parsed) ? parsed : new Date();
    const from = startOfMonth(subDays(base, 7));
    // Tampon volontairement court : la fenêtre doit rester sous le plafond de
    // lignes de PostgREST, sinon des créneaux disparaissent du planning sans
    // erreur. Un mois et demi visible suffit pour que naviguer d'une semaine à
    // l'autre reste dans la fenêtre déjà en cache.
    const to = endOfMonth(addDays(base, dayCount + 7));
    return { fromDate: format(from, "yyyy-MM-dd"), toDate: format(to, "yyyy-MM-dd") };
  }, [searchParams, dayCount]);

  // Data
  const { bookings, hotels, therapists, getHotelInfo, refetch, isLoading } =
    useBookingData({ fromDate, toDate });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI state
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>();
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>();
  const [selectedHotelId, setSelectedHotelId] = useState<string>();
  const [viewedBooking, setViewedBooking] = useState<BookingWithTreatments | null>(null);

  // Blocage ponctuel de créneaux (shooting, maintenance), depuis le menu
  // accolé au bouton "Nouvelle réservation".
  const [isRoomBlockOpen, setIsRoomBlockOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  // Le menu s'ouvre au survol : on retarde la fermeture pour laisser le curseur
  // traverser le vide entre le bouton et le panneau (rendu dans un portail,
  // donc hors du conteneur qui porte les handlers de survol).
  const createMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openCreateMenu = useCallback(() => {
    if (createMenuCloseTimer.current) clearTimeout(createMenuCloseTimer.current);
    setIsCreateMenuOpen(true);
  }, []);
  const scheduleCloseCreateMenu = useCallback(() => {
    if (createMenuCloseTimer.current) clearTimeout(createMenuCloseTimer.current);
    createMenuCloseTimer.current = setTimeout(() => setIsCreateMenuOpen(false), 150);
  }, []);
  useEffect(() => () => {
    if (createMenuCloseTimer.current) clearTimeout(createMenuCloseTimer.current);
  }, []);

  // Commodités réservées sans booking : création depuis la barre d'actions,
  // fiche au clic, édition depuis la fiche.
  const [isAmenityCreateOpen, setIsAmenityCreateOpen] = useState(false);
  const [isAmenityDetailOpen, setIsAmenityDetailOpen] = useState(false);
  const [viewedAmenityBooking, setViewedAmenityBooking] = useState<AmenityBookingForCalendar | null>(null);
  const [editingAmenityBooking, setEditingAmenityBooking] = useState<AmenityBookingForCalendar | null>(null);

  // --- LOGIQUE DE REDIRECTION (ADAPTÉE À LA NOUVELLE PAGE) ---
useEffect(() => {
  const bookingId = searchParams.get("id");
  if (bookingId && bookings.length > 0) {
    const target = bookings.find(
      (b) => b.id === bookingId || b.booking_id?.toString() === bookingId
    );
    
    if (target) {
      // Au lieu d'ouvrir l'ancienne modale
      // On redirige vers la nouvelle page.
      // replace: true évite d'empiler l'entrée `?id=...` dans l'historique,
      // sinon le bouton "retour" y revient et re-déclenche cette redirection (boucle).
      navigate(`/admin/bookings/${target.id}`, { replace: true });
    }
  }
}, [searchParams, bookings, navigate]); // Se déclenche quand l'URL change ou quand les données arrivent
  // -----------------------------------------------------------

  // Payment link state
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  const [paymentLinkBooking, setPaymentLinkBooking] = useState<BookingWithTreatments | null>(null);
  const [cancelBooking, setCancelBooking] = useState<BookingWithTreatments | null>(null);

  // Filters
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    hotelFilter,
    setHotelFilter,
    therapistFilter,
    setTherapistFilter,
    filteredBookings,
  } = useBookingFilters(bookings, "planning.filters");

  // In venue_manager view, force-scope the venue filter to the impersonated venue.
  const currentVenueId = useCurrentVenueId();
  useEffect(() => {
    if (currentVenueId && (hotelFilter.length !== 1 || hotelFilter[0] !== currentVenueId)) {
      setHotelFilter([currentVenueId]);
    }
  }, [currentVenueId, hotelFilter, setHotelFilter]);

  // Les amenities, la légende et l'affichage des annulés n'ont de sens que sur
  // un lieu unique : une sélection multiple retombe sur la vue "tous lieux".
  const singleVenueId = hotelFilter.length === 1 ? hotelFilter[0] : null;
  const hasVenueFilter = !!singleVenueId;

  // Les colonnes thérapeutes n'ont de sens que sur une seule journée : un même
  // thérapeute peut travailler sur plusieurs lieux le même jour, et c'est
  // justement ce que la vue multi-lieux rend visible.
  const effectiveDayCount = planningMode === "therapists" ? 1 : dayCount;

  // Calendar-only visibility of cancelled bookings (toggled via the legend).
  // Reset to hidden whenever we leave a single-venue view.
  const [showCancelled, setShowCancelled] = useState(false);
  useEffect(() => {
    if (!hasVenueFilter) setShowCancelled(false);
  }, [hasVenueFilter]);

  // Bookings shown on the calendar (planning) only — the list view keeps the
  // full filteredBookings set. No venue: hide cancelled + no-show. Venue
  // filtered: hide cancelled unless the user re-enabled them via the legend.
  const calendarBookings = useMemo(() => {
    return filteredBookings?.filter((b) => {
      if (!hasVenueFilter) {
        return b.status !== "cancelled" && b.status !== "noshow";
      }
      return showCancelled || b.status !== "cancelled";
    });
  }, [filteredBookings, hasVenueFilter, showCancelled]);

  const { amenities: venueAmenities } = useVenueAmenities(singleVenueId ?? "");

  // Une commodité réservée avec un booking est déjà dessinée par la carte de ce
  // booking. Restent celles saisies pour elles-mêmes (import Hana, réservation
  // directe d'un accès) : sans elles, la piscine n'apparaîtrait nulle part.
  const { amenityBookings } = useAmenityBookingData({
    hotelFilter: singleVenueId ?? undefined,
    venueAmenities,
    fromDate,
    toDate,
  });
  const standaloneAmenityBookings = useMemo(
    () => amenityBookings.filter((b) => !b.linked_booking_id),
    [amenityBookings],
  );

  // Calendar sidebar state
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>({ treatments: true });

  const calendarEntries = hasVenueFilter
    ? buildCalendarEntries(venueAmenities, i18n.language)
    : [];
  const showSidebar = view === "calendar";

  const handleCalendarToggle = (id: string, visible: boolean) => {
    setVisibleCalendars((prev) => ({ ...prev, [id]: visible }));
  };
  const handleShowAll = () => {
    const all: Record<string, boolean> = {};
    calendarEntries.forEach((e) => { all[e.id] = true; });
    setVisibleCalendars(all);
  };
  const handleHideAll = () => {
    const none: Record<string, boolean> = {};
    calendarEntries.forEach((e) => { none[e.id] = false; });
    setVisibleCalendars(none);
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Selection
  const { selectedBooking, setSelectedBooking } = useBookingSelection({
    bookings,
    onOpenEdit: () => setIsEditDialogOpen(true),
  });

  // Calendar logic
  const calendar = useCalendarLogic({
    filteredBookings: calendarBookings,
    activeTimezone,
    dayCount: effectiveDayCount,
    persistDateInUrl: true,
  });

  // Lieux affichés : la sélection, ou tous les lieux quand aucun filtre n'est posé.
  const visibleVenueIds = useMemo(
    () => (hotelFilter.length > 0 ? hotelFilter : (hotels ?? []).map((h) => h.id)),
    [hotelFilter, hotels],
  );

  // Treatments of the venue, for the therapist-view search. Les menus étant par
  // lieu, la recherche par soin reste réservée au mono-lieu.
  const { data: venueTreatments } = useVenueTreatmentMenus(
    planningMode === "therapists" ? singleVenueId : null,
  );

  // Memoized: the hook recomputes everything whenever this object identity changes.
  const searchedTreatment = useMemo(() => {
    if (searchedTreatmentId === ALL_TREATMENTS) return null;
    const found = (venueTreatments ?? []).find((tm) => tm.id === searchedTreatmentId);
    return found ? { id: found.id, duration: found.duration } : null;
  }, [searchedTreatmentId, venueTreatments]);

  // Therapist-day planning. Fed with the *unfiltered* bookings on purpose: a
  // booking hidden by the toolbar filters still occupies its therapist.
  const therapistPlanning = useTherapistDayPlanning({
    venueIds: planningMode === "therapists" ? visibleVenueIds : [],
    date: calendar.currentWeekStart,
    bookings,
    startHour: calendar.startHour,
    endHour: calendar.endHour,
    showOnlyScheduled,
    treatment: searchedTreatment,
  });

  // Blocages ponctuels datés de la plage affichée, pour la vue calendrier.
  // Sans filtre de lieu on interroge tous les lieux visibles : la vue les
  // mélange dans une même colonne, chaque bande porte donc le nom du lieu.
  const [editingRoomBlock, setEditingRoomBlock] = useState<RoomBlockRow | null>(null);
  const [deletingRoomBlock, setDeletingRoomBlock] = useState<RoomBlockRow | null>(null);
  const deleteRoomBlockRow = useDeleteRoomBlockRow();

  const rangeStart = calendar.weekDays[0] ?? calendar.currentWeekStart;
  const rangeEnd = calendar.weekDays[calendar.weekDays.length - 1] ?? rangeStart;
  const { data: roomBlocks } = useRoomBlocks({
    venueId: visibleVenueIds,
    from: format(rangeStart, "yyyy-MM-dd"),
    to: format(rangeEnd, "yyyy-MM-dd"),
  });

  // Overflow control
  useOverflowControl(true);

  // Layout calculation refs
  const headerRef = useRef<HTMLDivElement>(null);

  const computeRows = useCallback(() => {
    if (view !== 'list') return;

    const rowHeight = 48;
    const tableHeaderHeight = 32;
    const paginationHeight = 48;
    const sidebarOffset = 64;
    const headerHeight = headerRef.current?.offsetHeight || 140;
    const contentPadding = 48;

    const usedHeight = headerHeight + tableHeaderHeight + paginationHeight + contentPadding + sidebarOffset;
    const availableForRows = window.innerHeight - usedHeight;
    const rows = Math.max(5, Math.floor(availableForRows / rowHeight));

    setItemsPerPage(rows);
  }, [view]);

  useEffect(() => {
    computeRows();
    window.addEventListener("resize", computeRows);
    return () => window.removeEventListener("resize", computeRows);
  }, [computeRows]);

  // Pagination calculations
  const paginatedBookings =
    filteredBookings?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) ?? [];
  const emptyRowsCount = Math.max(0, itemsPerPage - paginatedBookings.length);
  const totalPages = Math.max(1, Math.ceil((filteredBookings?.length ?? 0) / itemsPerPage));

  // Handlers
  const handleCalendarClick = (date: Date, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
    setSelectedTherapistId(undefined);
    setSelectedHotelId(undefined);
    setIsCreateDialogOpen(true);
  };

  // `hotelId` est absent quand le thérapeute tourne sur plusieurs lieux affichés :
  // le dialog laisse alors le choix du lieu.
  const handleTherapistSlotClick = (
    date: Date,
    time: string,
    therapistId: string,
    hotelId?: string,
  ) => {
    setSelectedDate(date);
    setSelectedTime(time);
    setSelectedTherapistId(therapistId);
    setSelectedHotelId(hotelId);
    setIsCreateDialogOpen(true);
  };

  const handleOpenCreateDialog = () => {
    setSelectedTherapistId(undefined);
    setSelectedHotelId(undefined);
    setIsCreateDialogOpen(true);
  };

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      // Navigation vers la nouvelle page détaillée au lieu d'ouvrir la modale
      navigate(`/admin/bookings/${booking.id}`);
    }
  };

  const handleAmenityBookingClick = (booking: AmenityBookingForCalendar) => {
    setViewedAmenityBooking(booking);
    setIsAmenityDetailOpen(true);
  };

  const handleEditFromDetail = () => {
    if (viewedBooking) {
      setSelectedBooking(viewedBooking);
      setIsDetailDialogOpen(false);
      setIsEditDialogOpen(true);
    }
  };

  const handleFilterChange =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setCurrentPage(1);
    };

  const handleSendPaymentLink = () => {
    if (viewedBooking) {
      setPaymentLinkBooking(viewedBooking);
      setIsPaymentLinkDialogOpen(true);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <div className="h-full min-h-0 bg-background flex flex-col overflow-hidden">
      {/* Header & Filters — single toolbar row to maximize planning space */}
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-3 md:pt-4">
        <BookingFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={handleFilterChange(setStatusFilter)}
          hotelFilter={hotelFilter}
          onHotelChange={handleFilterChange(setHotelFilter)}
          therapistFilter={therapistFilter}
          onTherapistChange={handleFilterChange(setTherapistFilter)}
          view={view}
          onViewChange={setView}
          dayCount={dayCount}
          onDayCountChange={setDayCount}
          planningMode={planningMode}
          onPlanningModeChange={setPlanningMode}
          isAdmin={isAdmin}
          hotels={hotels}
          therapists={therapists}
          hideSearch
          hideViewToggle
          groupFiltersRight
          leading={
            <h1 className="text-lg font-medium text-foreground mr-1">{t("bookingsPage.planningTitle")}</h1>
          }
          trailing={
            <>
              {showSidebar && (
                <CalendarSidebarMobile
                  entries={calendarEntries}
                  visibleCalendars={visibleCalendars}
                  onToggle={handleCalendarToggle}
                  onShowAll={handleShowAll}
                  onHideAll={handleHideAll}
                  hotels={hotels}
                  hotelFilter={hotelFilter}
                  showCancelled={showCancelled}
                  onToggleCancelled={() => setShowCancelled((v) => !v)}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsCoverageOpen(true)}
                title={t("planning.coverage.title")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title={t("bookingsPage.refresh")}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-cyan-600 hover:bg-cyan-700 text-white transition-transform duration-100 active:scale-90"
                onClick={() => setIsAmenityCreateOpen(true)}
              >
                Commodité
                <Waves className="h-3.5 w-3.5 ml-1" />
              </Button>
              {/* Split button : action principale + menu (ouvert au survol) */}
              <div className="flex">
                <Button
                  onClick={handleOpenCreateDialog}
                  size="sm"
                  className="h-8 text-xs transition-transform duration-100 active:scale-90 rounded-r-none"
                >
                  {isConcierge ? t("bookingsPage.newRequest") : t("bookingsPage.newBooking")}
                </Button>
                {/* modal={false} : en mode modal Radix pose pointer-events:none
                    sur le body, le conteneur perdait le survol et le menu
                    s'ouvrait/fermait en boucle. */}
                <DropdownMenu modal={false} open={isCreateMenuOpen} onOpenChange={setIsCreateMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      aria-label={t("planning.moreCreateActions")}
                      className="h-8 w-7 rounded-l-none border-l border-background/30 px-0"
                      onMouseEnter={openCreateMenu}
                      onMouseLeave={scheduleCloseCreateMenu}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56"
                    onMouseEnter={openCreateMenu}
                    onMouseLeave={scheduleCloseCreateMenu}
                  >
                    <DropdownMenuItem
                      disabled={!singleVenueId}
                      onSelect={() => setIsRoomBlockOpen(true)}
                    >
                      <Ban className="mr-2 h-3.5 w-3.5" />
                      {singleVenueId
                        ? t("roomBlocks.dialogTitle")
                        : t("roomBlocks.selectVenueFirst")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
        <div className="bg-card rounded-lg border border-border h-full flex flex-row overflow-hidden">
          {showSidebar && (
            <CalendarSidebarDesktop
              entries={calendarEntries}
              visibleCalendars={visibleCalendars}
              onToggle={handleCalendarToggle}
              onShowAll={handleShowAll}
              onHideAll={handleHideAll}
              hotels={hotels}
              hotelFilter={hotelFilter}
              showCancelled={showCancelled}
              onToggleCancelled={() => setShowCancelled((v) => !v)}
            />
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
          {isLoading && !bookings ? (
            <AppLoader fullScreen={false} className="flex-1" />
          ) : view === "calendar" && planningMode === "therapists" ? (
            <TherapistDayView
              date={calendar.currentWeekStart}
              planning={therapistPlanning}
              hours={calendar.hours}
              hourHeight={calendar.hourHeight}
              startHour={calendar.startHour}
              endHour={calendar.endHour}
              onPreviousDay={calendar.handlePreviousWeek}
              onNextDay={calendar.handleNextWeek}
              onGoToToday={calendar.goToToday}
              onSetDate={calendar.setViewDate}
              getBookingPosition={calendar.getBookingPosition}
              getBookingsLayoutForDay={calendar.getBookingsLayoutForDay}
              getCurrentTimePosition={calendar.getCurrentTimePosition}
              getCalendarCardColor={calendar.getCalendarCardColor}
              getStatusColor={calendar.getStatusColor}
              getTranslatedStatus={calendar.getTranslatedStatus}
              getHotelInfo={getHotelInfo}
              onBookingClick={handleBookingClick}
              onSlotClick={handleTherapistSlotClick}
              showOnlyScheduled={showOnlyScheduled}
              onShowOnlyScheduledChange={setShowOnlyScheduled}
              treatments={venueTreatments ?? []}
              selectedTreatmentId={searchedTreatmentId}
              onSelectedTreatmentChange={setSearchedTreatmentId}
            />
          ) : view === "calendar" ? (
            <BookingCalendarView
              weekDays={calendar.weekDays}
              currentWeekStart={calendar.currentWeekStart}
              dayCount={dayCount}
              onPreviousWeek={calendar.handlePreviousWeek}
              onNextWeek={calendar.handleNextWeek}
              onGoToToday={calendar.goToToday}
              onSetViewDate={calendar.setViewDate}
              getBookingsForDay={calendar.getBookingsForDay}
              getBookingPosition={calendar.getBookingPosition}
              getBookingsLayoutForDay={calendar.getBookingsLayoutForDay}
              getCurrentTimePosition={calendar.getCurrentTimePosition}
              getStatusColor={calendar.getStatusColor}
              getTranslatedStatus={calendar.getTranslatedStatus}
              getCalendarCardColor={calendar.getCalendarCardColor}
              onCalendarClick={handleCalendarClick}
              onBookingClick={handleBookingClick}
              hours={calendar.hours}
              hourHeight={calendar.hourHeight}
              startHour={calendar.startHour}
              getHotelInfo={getHotelInfo}
              hotels={hotels}
              hotelFilter={hotelFilter}
              showCleanupBuffer={!!hasVenueFilter}
              visibleCalendars={hasVenueFilter ? visibleCalendars : undefined}
              amenityBookings={standaloneAmenityBookings}
              onAmenityBookingClick={handleAmenityBookingClick}
              roomBlocks={roomBlocks}
              onEditRoomBlock={setEditingRoomBlock}
              onDeleteRoomBlock={setDeletingRoomBlock}
            />
          ) : (
            <BookingListView
              paginatedBookings={paginatedBookings}
              filteredBookingsCount={filteredBookings?.length ?? 0}
              emptyRowsCount={emptyRowsCount}
              onBookingClick={handleBookingClick}
              getHotelInfo={getHotelInfo}
              isAdmin={isAdmin}
              isConcierge={isConcierge}
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredBookings?.length ?? 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onRequestCancel={setCancelBooking}
            />
          )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CreateBookingDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        presetTherapistId={selectedTherapistId}
        presetHotelId={selectedHotelId}
      />

      <BookingDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        booking={viewedBooking}
        hotel={viewedBooking ? getHotelInfo(viewedBooking.hotel_id) : null}
        onEdit={handleEditFromDetail}
        onSendPaymentLink={handleSendPaymentLink}
      />

      <EditBookingDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        booking={selectedBooking}
      />

      {/* Création d'une commodité sans booking derrière */}
      <CreateAmenityBookingDialog
        open={isAmenityCreateOpen}
        onOpenChange={setIsAmenityCreateOpen}
        hotelId={singleVenueId ?? undefined}
        venueAmenities={hasVenueFilter ? venueAmenities : undefined}
        hotels={hotels}
        preselectedDate={selectedDate}
        preselectedTime={selectedTime}
      />

      <AmenityBookingDetailDialog
        open={isAmenityDetailOpen}
        onOpenChange={setIsAmenityDetailOpen}
        booking={viewedAmenityBooking}
        onEdit={(booking) => {
          setIsAmenityDetailOpen(false);
          setEditingAmenityBooking(booking);
        }}
      />

      {/* Édition d'une commodité existante (le dialog de création en mode édition) */}
      <CreateAmenityBookingDialog
        open={!!editingAmenityBooking}
        onOpenChange={(o) => {
          if (!o) setEditingAmenityBooking(null);
        }}
        hotelId={editingAmenityBooking?.hotel_id}
        editBooking={editingAmenityBooking}
      />

      {cancelBooking && (
        <CancelBookingDialog
          isOpen={!!cancelBooking}
          onClose={() => setCancelBooking(null)}
          onSuccess={() => {
            setCancelBooking(null);
            refetch();
          }}
          bookingId={cancelBooking.id}
          booking={{
            booking_id: cancelBooking.booking_id,
            client_first_name: cancelBooking.client_first_name,
            client_last_name: cancelBooking.client_last_name,
            total_price: Number(cancelBooking.total_price),
            hotel_id: cancelBooking.hotel_id,
            status: cancelBooking.status,
            payment_method: cancelBooking.payment_method,
            payment_status: cancelBooking.payment_status,
            booking_date: cancelBooking.booking_date,
            booking_time: cancelBooking.booking_time,
          }}
          userRole={isConcierge ? "concierge" : "admin"}
        />
      )}

      {singleVenueId && (
        <RoomBlockDialog
          open={isRoomBlockOpen}
          onOpenChange={setIsRoomBlockOpen}
          hotelId={singleVenueId}
          defaultDate={format(calendar.currentWeekStart, "yyyy-MM-dd")}
        />
      )}

      {/* Édition d'un blocage depuis le planning : le lieu vient de la ligne,
          pas du filtre — une bande peut appartenir à un autre lieu affiché.
          La `key` force la ré-initialisation du formulaire à chaque blocage. */}
      {editingRoomBlock && (
        <RoomBlockDialog
          key={editingRoomBlock.id}
          open
          onOpenChange={(next) => !next && setEditingRoomBlock(null)}
          hotelId={editingRoomBlock.hotel_id}
          block={editingRoomBlock}
        />
      )}

      <AlertDialog
        open={!!deletingRoomBlock}
        onOpenChange={(next) => !next && setDeletingRoomBlock(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("roomBlocks.confirmDelete", { label: deletingRoomBlock?.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("roomBlocks.confirmDeleteOccurrence", {
                date: deletingRoomBlock?.block_date ?? "",
                start: deletingRoomBlock?.start_time.substring(0, 5) ?? "",
                end: deletingRoomBlock?.end_time.substring(0, 5) ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("roomBlocks.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingRoomBlock) deleteRoomBlockRow.mutate(deletingRoomBlock.id);
                setDeletingRoomBlock(null);
              }}
            >
              {t("roomBlocks.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {paymentLinkBooking && (
        <SendPaymentLinkDialog
          open={isPaymentLinkDialogOpen}
          onOpenChange={setIsPaymentLinkDialogOpen}
          booking={{
            id: paymentLinkBooking.id,
            booking_id: paymentLinkBooking.booking_id,
            client_first_name: paymentLinkBooking.client_first_name,
            client_last_name: paymentLinkBooking.client_last_name,
            client_email: paymentLinkBooking.client_email,
            phone: paymentLinkBooking.phone,
            room_number: paymentLinkBooking.room_number,
            booking_date: paymentLinkBooking.booking_date,
            booking_time: paymentLinkBooking.booking_time,
            total_price: paymentLinkBooking.total_price,
            hotel_name: paymentLinkBooking.hotel_name,
            treatments: paymentLinkBooking.treatments,
            currency: getHotelInfo(paymentLinkBooking.hotel_id)?.currency || 'EUR',
          }}
        />
      )}

      <TreatmentCoverageDialog
        open={isCoverageOpen}
        onOpenChange={setIsCoverageOpen}
        hotels={hotels ?? []}
      />
    </div>
  );
}