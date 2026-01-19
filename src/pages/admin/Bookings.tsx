import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import CreateBookingDialog from "@/components/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useUserContext } from "@/hooks/useUserContext";
import { useOverflowControl } from "@/hooks/useOverflowControl";

import {
  useBookingData,
  useBookingFilters,
  useCalendarLogic,
  useBookingSelection,
} from "@/hooks/booking";

import {
  BookingFilters,
  BookingCalendarView,
  BookingListView,
  InvoicePreviewDialog,
} from "@/components/booking";

export default function Booking() {
  const { isAdmin, isConcierge } = useUserContext();
  const { activeTimezone } = useTimezone();

  // Data
  const { bookings, hotels, hairdressers, getHotelInfo } = useBookingData();

  // UI state
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>();

  // Invoice state
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);

  // Filters
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    hotelFilter,
    setHotelFilter,
    hairdresserFilter,
    setHairdresserFilter,
    filteredBookings,
  } = useBookingFilters(bookings);

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
    setSelectedBooking(booking);
    setIsEditDialogOpen(true);
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

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header & Filters */}
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            📅 Bookings
          </h1>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Create a booking
          </Button>
        </div>

        <BookingFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={handleFilterChange(setStatusFilter)}
          hotelFilter={hotelFilter}
          onHotelChange={handleFilterChange(setHotelFilter)}
          hairdresserFilter={hairdresserFilter}
          onHairdresserChange={handleFilterChange(setHairdresserFilter)}
          view={view}
          onViewChange={setView}
          isAdmin={isAdmin}
          hotels={hotels}
          hairdressers={hairdressers}
        />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col">
          {view === "calendar" ? (
            <BookingCalendarView
              weekDays={calendar.weekDays}
              currentWeekStart={calendar.currentWeekStart}
              onPreviousWeek={calendar.handlePreviousWeek}
              onNextWeek={calendar.handleNextWeek}
              getBookingsForDay={calendar.getBookingsForDay}
              getBookingPosition={calendar.getBookingPosition}
              getCurrentTimePosition={calendar.getCurrentTimePosition}
              getStatusColor={calendar.getStatusColor}
              getTranslatedStatus={calendar.getTranslatedStatus}
              getStatusCardColor={calendar.getStatusCardColor}
              onCalendarClick={handleCalendarClick}
              onBookingClick={handleBookingClick}
              hours={calendar.hours}
              hourHeight={calendar.hourHeight}
              startHour={calendar.startHour}
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
    </div>
  );
}
