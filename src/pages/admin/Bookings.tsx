import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { BookingDetailDialog } from "@/components/admin/details/BookingDetailDialog";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useUserContext } from "@/hooks/useUserContext";
import { useOverflowControl } from "@/hooks/useOverflowControl";

import { useTranslation } from "react-i18next";
import {
  useBookingData,
  useBookingFilters,
  useCalendarLogic,
  useBookingSelection,
  useAmenityBookingData,
  type BookingWithTreatments,
} from "@/hooks/booking";

import {
  BookingFilters,
  BookingCalendarView,
  BookingListView,
  InvoicePreviewDialog,
  SendPaymentLinkDialog,
} from "@/components/booking";
import {
  CalendarSidebarDesktop,
  CalendarSidebarMobile,
  buildCalendarEntries,
} from "@/components/booking/CalendarSidebar";
import { useVenueAmenities } from "@/hooks/useVenueAmenities";

export default function Booking() {
  const navigate = useNavigate();
  const { isAdmin, isConcierge } = useUserContext();
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

  // Invoice state
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);

  // Payment link state
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  const [paymentLinkBooking, setPaymentLinkBooking] = useState<BookingWithTreatments | null>(null);

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
  } = useBookingFilters(bookings);

  // Amenity data
  const hasVenueFilter = hotelFilter && hotelFilter !== "all";
  const { amenities: venueAmenities } = useVenueAmenities(hasVenueFilter ? hotelFilter : "");
  const { amenityBookings, getAmenityBookingsForDay } = useAmenityBookingData({
    hotelFilter: hasVenueFilter ? hotelFilter : undefined,
  });

  // Calendar sidebar state
  const [visibleCalendars, setVisibleCalendars] = useState<Record<string, boolean>>({ treatments: true });

  const calendarEntries = hasVenueFilter
    ? buildCalendarEntries(venueAmenities, i18n.language)
    : [];
  const showSidebar = calendarEntries.length > 1 && view === "calendar";

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
    filteredBookings,
    activeTimezone,
    dayCount,
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
  const totalListColumns = 10;
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

  const handleInvoicePreview = (html: string, bookingId: number, isRoomPayment: boolean) => {
    setInvoiceHTML(html);
    setInvoiceBookingId(bookingId);
    setInvoiceIsRoomPayment(isRoomPayment);
    setIsInvoicePreviewOpen(true);
  };

  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header & Filters */}
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-3 md:pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Planning
          </h1>
          <div className="flex items-center gap-2">
            {showSidebar && (
              <CalendarSidebarMobile
                entries={calendarEntries}
                visibleCalendars={visibleCalendars}
                onToggle={handleCalendarToggle}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
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
            <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-8 text-xs">
              {isConcierge ? "Nouvelle demande" : "Nouvelle réservation"}
            </Button>
          </div>
        </div>

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
              amenityBookings={hasVenueFilter ? amenityBookings : undefined}
              visibleCalendars={hasVenueFilter ? visibleCalendars : undefined}
            />
          ) : (
            <BookingListView
              paginatedBookings={paginatedBookings}
              filteredBookingsCount={filteredBookings?.length ?? 0}
              emptyRowsCount={emptyRowsCount}
              totalColumns={totalListColumns}
              onBookingClick={handleBookingClick}
              getHotelInfo={getHotelInfo}
              isAdmin={isAdmin}
              isConcierge={isConcierge}
              onInvoicePreview={handleInvoicePreview}
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredBookings?.length ?? 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
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

      <InvoicePreviewDialog
        open={isInvoicePreviewOpen}
        onOpenChange={setIsInvoicePreviewOpen}
        invoiceHTML={invoiceHTML}
        bookingId={invoiceBookingId}
        isRoomPayment={invoiceIsRoomPayment}
      />

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