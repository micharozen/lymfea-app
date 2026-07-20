import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, RefreshCw, ChevronDown, CreditCard, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildCsv, downloadCsv, formatCsvAmount, type CsvColumn } from "@/lib/csvExport";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { bookingStatusConfig, type BookingStatus } from "@/utils/statusStyles";
import { QuickActionsDialog } from "@/components/admin/quick-actions/QuickActionsDialog";
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
import { ColumnSelector } from "@/components/booking/ColumnSelector";
import { BOOKING_COLUMNS } from "@/components/booking/bookingColumns";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import type { PageSize } from "@/components/table/TablePagination";

export default function BookingsList() {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const { isAdmin } = useUserContext();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const [searchParams] = useSearchParams();

  const [periodDays, setPeriodDays] = useState<number>(() => {
    const stored = Number(localStorage.getItem("bookingsList.periodDays"));
    return [10, 30, 60, 90].includes(stored) ? stored : 10;
  });

  // Plage explicite (ex. "juillet complet" pour un pointage) ; prioritaire sur
  // la fenêtre glissante periodDays quand elle est renseignée.
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

  const fromDate = useMemo(() => {
    if (customRange) return customRange.from;
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString().slice(0, 10);
  }, [periodDays, customRange]);

  const { bookings, hotels, therapists, getHotelInfo, refetch } = useBookingData({
    fromDate,
    toDate: customRange?.to,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<"payment" | "refund">("payment");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const bookingId = searchParams.get("id");
    if (bookingId && bookings && bookings.length > 0) {
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
    paymentMethodFilter,
    setPaymentMethodFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    filteredBookings,
    resetFilters,
  } = useBookingFilters(bookings, "bookingsList.filters");

  const columnPreferences = useColumnPreferences("bookingsList.columns", BOOKING_COLUMNS);

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
  // Nombre de lignes calculé pour remplir l'écran (mode "auto").
  const [autoRows, setAutoRows] = useState(15);
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const stored = localStorage.getItem("bookingsList.pageSize");
    if (stored && stored !== "auto" && [20, 50, 100].includes(Number(stored))) {
      return Number(stored);
    }
    return "auto";
  });

  const isAutoPageSize = pageSize === "auto";
  const itemsPerPage = isAutoPageSize ? autoRows : pageSize;

  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    localStorage.setItem("bookingsList.pageSize", String(size));
    setCurrentPage(1);
  };

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

    setAutoRows(rows);
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
  // En mode "auto" on remplit l'écran avec des lignes vides ; en taille fixe, le tableau défile.
  const emptyRowsCount = isAutoPageSize
    ? Math.max(0, itemsPerPage - paginatedBookings.length)
    : 0;
  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / itemsPerPage));

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      navigate(`/admin/bookings/${booking.id}`);
    }
  };

  const handleFilterChange =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setCurrentPage(1);
    };

  // La plage personnalisée vit sur la page, pas dans le hook : le reset doit
  // la remettre à zéro aussi, sinon le bouton resterait affiché après un clic.
  const handleResetFilters = () => {
    resetFilters();
    setCustomRange(null);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Exporte les réservations filtrées + triées (pas seulement la page affichée).
  // Une ligne = une réservation ; les prestations sont jointes dans une colonne.
  const handleExportCsv = () => {
    if (sortedBookings.length === 0) {
      toast.info(t("bookings.export.empty"));
      return;
    }
    const columns: CsvColumn<BookingWithTreatments>[] = [
      { header: t("bookings.export.columns.bookingNumber"), value: (b) => b.booking_id ?? "" },
      {
        header: t("bookings.export.columns.date"),
        value: (b) => (b.booking_date ? format(parseISO(b.booking_date), "dd/MM/yyyy") : ""),
      },
      { header: t("bookings.export.columns.time"), value: (b) => b.booking_time?.slice(0, 5) ?? "" },
      {
        header: t("bookings.export.columns.client"),
        value: (b) => [b.client_first_name, b.client_last_name].filter(Boolean).join(" "),
      },
      {
        header: t("bookings.export.columns.clientType"),
        value: (b) =>
          b.client_type
            ? t(`bookings.clientType.${b.client_type}`, { defaultValue: b.client_type })
            : "",
      },
      { header: t("bookings.export.columns.roomNumber"), value: (b) => b.room_number ?? "" },
      { header: t("bookings.export.columns.venue"), value: (b) => getHotelInfo(b.hotel_id)?.name ?? "" },
      {
        header: t("bookings.export.columns.therapist"),
        value: (b) =>
          b.therapist_display_names?.length
            ? b.therapist_display_names.join(", ")
            : b.therapist_name ?? "",
      },
      {
        header: t("bookings.export.columns.treatments"),
        value: (b) => b.treatments.map((tr) => tr.name).join(", "),
      },
      { header: t("bookings.export.columns.duration"), value: (b) => b.totalDuration ?? "" },
      { header: t("bookings.export.columns.amount"), value: (b) => formatCsvAmount(b.total_price) },
      {
        header: t("bookings.export.columns.currency"),
        value: (b) => getHotelInfo(b.hotel_id)?.currency ?? "EUR",
      },
      {
        header: t("bookings.export.columns.status"),
        value: (b) => bookingStatusConfig[b.status as BookingStatus]?.label ?? b.status ?? "",
      },
      {
        header: t("bookings.export.columns.paymentMethod"),
        value: (b) => paymentMethodLabel(b.payment_method),
      },
      {
        header: t("bookings.export.columns.paymentStatus"),
        value: (b) =>
          b.payment_status
            ? t(`bookings.export.paymentStatusValues.${b.payment_status}`, {
                defaultValue: b.payment_status,
              })
            : "",
      },
      { header: t("bookings.export.columns.customerNote"), value: (b) => b.customer_health_notes ?? "" },
      { header: t("bookings.export.columns.bookingNote"), value: (b) => b.client_note ?? "" },
    ];
    downloadCsv(buildCsv(sortedBookings, columns), `reservations_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success(t("bookings.export.success", { count: sortedBookings.length }));
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-3 md:pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            Réservations
          </h1>
          <div className="flex items-center gap-2">
            <ColumnSelector
              preferences={columnPreferences}
              hiddenKeys={
                isConcierge
                  ? BOOKING_COLUMNS.filter((c) => c.hideForConcierge).map((c) => c.key)
                  : []
              }
            />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  Actions
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {!isConcierge && (
                  <>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        setQuickAction("payment");
                        setIsQuickActionsOpen(true);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Créer un lien de paiement
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        setQuickAction("refund");
                        setIsQuickActionsOpen(true);
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Rembourser une réservation
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="cursor-pointer" onClick={handleExportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Exporter en CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          paymentMethodFilter={paymentMethodFilter}
          onPaymentMethodChange={handleFilterChange(setPaymentMethodFilter)}
          paymentStatusFilter={paymentStatusFilter}
          onPaymentStatusChange={handleFilterChange(setPaymentStatusFilter)}
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
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          filterVisibilityStorageKey="bookingsList.visibleFilters"
          onResetFilters={handleResetFilters}
        />
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 min-h-0 min-w-0">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col min-w-0 overflow-hidden">
          <BookingListView
            paginatedBookings={paginatedBookings}
            filteredBookingsCount={sortedBookings.length}
            emptyRowsCount={emptyRowsCount}
            columns={columnPreferences.visibleColumns}
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
            onColumnResize={columnPreferences.setWidth}
            onColumnResizeReset={columnPreferences.resetWidth}
            pageSize={pageSize}
            pageSizeOptions={[20, 50, 100]}
            onPageSizeChange={handlePageSizeChange}
            scrollable={!isAutoPageSize}
          />
        </div>
      </div>

      <QuickActionsDialog
        open={isQuickActionsOpen}
        onOpenChange={setIsQuickActionsOpen}
        initialAction={quickAction}
      />

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
