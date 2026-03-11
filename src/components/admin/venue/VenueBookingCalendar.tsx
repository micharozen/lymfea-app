import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { BookingDetailDialog } from "@/components/admin/details/BookingDetailDialog";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useUserContext } from "@/hooks/useUserContext";

import {
  useBookingData,
  useBookingFilters,
  useCalendarLogic,
  useBookingSelection,
  useVenueAvailability,
  type BookingWithTreatments,
} from "@/hooks/booking";

import {
  BookingFilters,
  BookingCalendarView,
  BookingListView,
  InvoicePreviewDialog,
  SendPaymentLinkDialog,
} from "@/components/booking";

interface VenueBookingCalendarProps {
  hotelId: string;
  hotelName?: string;
}

export function VenueBookingCalendar({ hotelId }: VenueBookingCalendarProps) {
  const { isAdmin, isConcierge } = useUserContext();
  const { activeTimezone } = useTimezone();
  const { t } = useTranslation("admin");

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

  // Day count with localStorage persistence (venue-specific key)
  const [dayCount, setDayCount] = useState<number>(() => {
    const saved = localStorage.getItem(`venue-planning-day-count-${hotelId}`);
    return saved ? Number(saved) : 5;
  });

  useEffect(() => {
    localStorage.setItem(`venue-planning-day-count-${hotelId}`, String(dayCount));
  }, [dayCount, hotelId]);

  // Availability overlay toggle (persisted per venue)
  const [showAvailability, setShowAvailability] = useState<boolean>(() => {
    const saved = localStorage.getItem(`venue-planning-availability-${hotelId}`);
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(`venue-planning-availability-${hotelId}`, String(showAvailability));
  }, [showAvailability, hotelId]);

  // Invoice state
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);

  // Payment link state
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  const [paymentLinkBooking, setPaymentLinkBooking] = useState<BookingWithTreatments | null>(null);

  // Filters — hotel filter locked to this venue
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

  // Lock hotel filter to current venue
  useEffect(() => {
    setHotelFilter(hotelId);
  }, [hotelId, setHotelFilter]);

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

  // Therapist availability data
  const availability = useVenueAvailability({
    venueId: hotelId,
    weekDays: calendar.weekDays,
  });

  // Layout calculation for list view
  const headerRef = useRef<HTMLDivElement>(null);

  const computeRows = useCallback(() => {
    if (view !== "list") return;

    const rowHeight = 48;
    const tableHeaderHeight = 32;
    const paginationHeight = 48;
    const headerHeight = headerRef.current?.offsetHeight || 100;
    const contentPadding = 48;

    const usedHeight = headerHeight + tableHeaderHeight + paginationHeight + contentPadding + 220;
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
      setViewedBooking(booking);
      setIsDetailDialogOpen(true);
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
    <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
      {/* Header */}
      <div ref={headerRef} className="flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {isConcierge ? "Demande" : "Réservation"}
          </Button>
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
          hideHotelFilter
          showAvailability={showAvailability}
          onShowAvailabilityChange={setShowAvailability}
        />
      </div>

      {/* Availability legend */}
      {showAvailability && view === "calendar" && (
        <div className="flex items-center gap-3 px-1 py-1 text-[10px] text-muted-foreground flex-shrink-0 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm bg-emerald-100 dark:bg-emerald-900/30" />
            <span>{t("planning.fullAvailability")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm bg-amber-100 dark:bg-amber-900/30" />
            <span>{t("planning.lowAvailability")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-2 rounded-sm"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(239, 68, 68, 0.15) 2px, rgba(239, 68, 68, 0.15) 4px)",
              }}
            />
            <span>{t("planning.noAvailability")}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden mt-2">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col">
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
              showAvailability={showAvailability}
              availabilityData={showAvailability ? {
                daySummaries: availability.daySummaries,
                hourAvailability: availability.hourAvailability,
              } : undefined}
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

      {/* Dialogs */}
      <CreateBookingDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        presetHotelId={hotelId}
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
            currency: getHotelInfo(paymentLinkBooking.hotel_id)?.currency || "EUR",
          }}
        />
      )}
    </div>
  );
}
