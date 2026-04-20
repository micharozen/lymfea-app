import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useUserContext } from "@/hooks/useUserContext";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import {
  useBookingData,
  useBookingFilters,
  useBookingSelection,
  type BookingWithTreatments,
} from "@/hooks/booking";
import {
  BookingFilters,
  BookingListView,
  InvoicePreviewDialog,
} from "@/components/booking";

export default function BookingsList() {
  const navigate = useNavigate();
  const { isAdmin, isConcierge } = useUserContext();
  const [searchParams] = useSearchParams();

  const { bookings, hotels, therapists, getHotelInfo, refetch } = useBookingData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const bookingId = searchParams.get("id");
    if (bookingId && bookings.length > 0) {
      const target = bookings.find(
        (b) => b.id === bookingId || b.booking_id?.toString() === bookingId
      );
      if (target) {
        navigate(`/admin/bookings/${target.id}`);
      }
    }
  }, [searchParams, bookings, navigate]);

  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);

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

  const sortedBookings = useMemo<BookingWithTreatments[]>(() => {
    const list = filteredBookings ?? [];
    return [...list].sort((a, b) => {
      const dateCmp = (b.booking_date ?? "").localeCompare(a.booking_date ?? "");
      if (dateCmp !== 0) return dateCmp;
      return (b.booking_time ?? "").localeCompare(a.booking_time ?? "");
    });
  }, [filteredBookings]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const { selectedBooking } = useBookingSelection({
    bookings,
    onOpenEdit: () => setIsEditDialogOpen(true),
  });

  useOverflowControl(true);

  const headerRef = useRef<HTMLDivElement>(null);

  const computeRows = useCallback(() => {
    const rowHeight = 56;
    const tableHeaderHeight = 32;
    const paginationHeight = 48;
    const sidebarOffset = 64;
    const headerHeight = headerRef.current?.offsetHeight || 140;
    const contentPadding = 48;
    const usedHeight =
      headerHeight + tableHeaderHeight + paginationHeight + contentPadding + sidebarOffset;
    const availableForRows = window.innerHeight - usedHeight;
    const rows = Math.max(5, Math.floor(availableForRows / rowHeight));

    setItemsPerPage(rows);
  }, []);

  useEffect(() => {
    computeRows();
    window.addEventListener("resize", computeRows);
    return () => window.removeEventListener("resize", computeRows);
  }, [computeRows]);

  const paginatedBookings = sortedBookings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalListColumns = 12;
  const emptyRowsCount = Math.max(0, itemsPerPage - paginatedBookings.length);
  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / itemsPerPage));

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      navigate(`/admin/bookings/${booking.id}`);
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-3 md:pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            Réservations
          </h1>
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
          view="list"
          onViewChange={() => {}}
          dayCount={5}
          onDayCountChange={() => {}}
          isAdmin={isAdmin}
          hotels={hotels}
          therapists={therapists}
          hideViewToggle
        />
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 min-h-0 min-w-0">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col min-w-0 overflow-hidden">
          <BookingListView
            paginatedBookings={paginatedBookings}
            filteredBookingsCount={sortedBookings.length}
            emptyRowsCount={emptyRowsCount}
            totalColumns={totalListColumns}
            onBookingClick={handleBookingClick}
            getHotelInfo={getHotelInfo}
            isAdmin={isAdmin}
            isConcierge={isConcierge}
            onInvoicePreview={handleInvoicePreview}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedBookings.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            paymentAsText
          />
        </div>
      </div>

      <CreateBookingDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
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
