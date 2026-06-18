import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useUserContext } from "@/hooks/useUserContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
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
  type BookingSortKey,
  type SortDirection,
} from "@/components/booking";

export default function BookingsList() {
  const navigate = useNavigate();
  const { isAdmin } = useUserContext();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const [searchParams] = useSearchParams();

  const [periodDays, setPeriodDays] = useState<number>(() => {
    const stored = Number(localStorage.getItem("bookingsList.periodDays"));
    return [10, 30, 60].includes(stored) ? stored : 10;
  });

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString().slice(0, 10);
  }, [periodDays]);

  const { bookings, hotels, therapists, getHotelInfo, refetch } = useBookingData({ fromDate });
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

  const [sortKey, setSortKey] = useState<BookingSortKey>("reservation");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedBookings = useMemo<BookingWithTreatments[]>(() => {
    const list = filteredBookings ?? [];
    const dir = sortDirection === "asc" ? 1 : -1;

    const getValue = (b: BookingWithTreatments): string | number => {
      switch (sortKey) {
        case "reservation":
          return b.booking_id ?? 0;
        case "date":
          return `${b.booking_date ?? ""}T${b.booking_time ?? ""}`;
        case "time":
          return b.booking_time ?? "";
        case "duration":
          return b.totalDuration ?? 0;
        case "status":
          return b.status ?? "";
        case "payment":
          return b.payment_status ?? "";
        case "client":
          return (b.client_last_name ?? b.client_first_name ?? "").toLowerCase();
        case "treatments":
          return b.treatments.map((t) => t.name).join(", ").toLowerCase();
        case "total":
          return b.total_price ?? 0;
        case "location":
          return (getHotelInfo(b.hotel_id)?.name ?? "").toLowerCase();
        case "therapist":
          return (b.therapist_name ?? "").toLowerCase();
        default:
          return 0;
      }
    };

    return [...list].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredBookings, sortKey, sortDirection, getHotelInfo]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const handlePeriodDaysChange = (days: number) => {
    setPeriodDays(days);
    localStorage.setItem("bookingsList.periodDays", String(days));
    setCurrentPage(1);
  };

  const handleSort = (key: BookingSortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

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
  const totalListColumns = 11;
  const emptyRowsCount = Math.max(0, itemsPerPage - paginatedBookings.length);
  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / itemsPerPage));

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      navigate(`/admin/bookings/${booking.id}`);
    }
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
          periodDays={periodDays}
          onPeriodDaysChange={handlePeriodDaysChange}
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
            isConcierge={isConcierge}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedBookings.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            paymentAsText
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
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
    </div>
  );
}
