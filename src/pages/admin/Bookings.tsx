import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { BookingDetailDialog } from "@/components/admin/details/BookingDetailDialog";
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
  type BookingWithTreatments,
  type AmenityBookingForCalendar,
} from "@/hooks/booking";

import {
  BookingFilters,
  BookingCalendarView,
  BookingListView,
  SendPaymentLinkDialog,
} from "@/components/booking";
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
  const { i18n } = useTranslation();
  
  // AJOUT : Récupération des paramètres de recherche de l'URL
  const [searchParams] = useSearchParams();

  // Data
  const { bookings, hotels, therapists, getHotelInfo, refetch } = useBookingData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI state
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>();
  const [viewedBooking, setViewedBooking] = useState<BookingWithTreatments | null>(null);

  // Amenity dialog state
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
      // On redirige vers la nouvelle page 
      navigate(`/admin/bookings/${target.id}`);
    }
  }
}, [searchParams, bookings, navigate]); // Se déclenche quand l'URL change ou quand les données arrivent
  // -----------------------------------------------------------

  // Day count with localStorage persistence
  const [dayCount, setDayCount] = useState<number>(() => {
    const saved = localStorage.getItem('planning-day-count');
    return saved ? Number(saved) : 5;
  });

  useEffect(() => {
    localStorage.setItem('planning-day-count', String(dayCount));
  }, [dayCount]);

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
  const { amenityBookings, getAmenityBookingsForDay } = useAmenityBookingData({
    hotelFilter: singleVenueId ?? undefined,
  });

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
    dayCount,
    persistDateInUrl: true,
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
    setIsCreateDialogOpen(true);
  };

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      // Navigation vers la nouvelle page détaillée au lieu d'ouvrir la modale
      navigate(`/admin/bookings/${booking.id}`);
    }
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

  const handleAmenityBookingClick = (booking: AmenityBookingForCalendar) => {
    setViewedAmenityBooking(booking);
    setIsAmenityDetailOpen(true);
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
          isAdmin={isAdmin}
          hotels={hotels}
          therapists={therapists}
          hideSearch
          hideViewToggle
          groupFiltersRight
          leading={
            <h1 className="text-lg font-medium text-foreground mr-1">Planning</h1>
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
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh"
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
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                size="sm"
                className="h-8 text-xs transition-transform duration-100 active:scale-90"
              >
                {isConcierge ? "Nouvelle demande" : "Nouvelle réservation"}
              </Button>
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
          {view === "calendar" ? (
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
              amenityBookings={amenityBookings}
              visibleCalendars={hasVenueFilter ? visibleCalendars : undefined}
              onAmenityBookingClick={handleAmenityBookingClick}
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

      {/* Amenity dialogs */}
      <CreateAmenityBookingDialog
        open={isAmenityCreateOpen}
        onOpenChange={setIsAmenityCreateOpen}
        hotelId={singleVenueId ?? undefined}
        venueAmenities={hasVenueFilter ? venueAmenities : undefined}
        hotels={hotels}
        preselectedDate={selectedDate}
        preselectedTime={selectedTime}
      />

      {/* Edit an existing amenity booking (reuses the create dialog in edit mode) */}
      <CreateAmenityBookingDialog
        open={!!editingAmenityBooking}
        onOpenChange={(o) => {
          if (!o) setEditingAmenityBooking(null);
        }}
        hotelId={editingAmenityBooking?.hotel_id}
        editBooking={editingAmenityBooking}
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
    </div>
  );
}