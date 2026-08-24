import { useState, useRef, useEffect, useMemo } from "react";
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
import { getBookingStatusConfig } from "@/utils/statusStyles";
import { QuickActionsDialog } from "@/components/admin/quick-actions/QuickActionsDialog";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useUserContext } from "@/hooks/useUserContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import {
  useBookingsList,
  useBookingFilters,
  useBookingSelection,
  type BookingWithTreatments,
} from "@/hooks/booking";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import type { BookingListFilters, BookingListSort } from "@shared/db";
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
import { AppLoader } from "@/components/AppLoader";

export default function BookingsList() {
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const { isAdmin } = useUserContext();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const [searchParams] = useSearchParams();

  // Plage explicite (ex. "juillet complet" pour un pointage). Vide = pas de
  // borne : la liste couvre tout l'historique, chargée par lots.
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<"payment" | "refund">("payment");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
    resetFilters,
    // La liste est filtrée par Postgres : le hook ne sert plus qu'à porter
    // l'état des filtres (et à le mémoriser d'un écran à l'autre).
  } = useBookingFilters(undefined, "bookingsList.filters");

  const columnPreferences = useColumnPreferences("bookingsList.columns", BOOKING_COLUMNS);

  const [sortKey, setSortKey] = useState<BookingSortKey>("reservation");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // 450 ms : laisse finir un mot avant de repartir en base.
  const debouncedSearch = useDebounce(searchQuery, 450);

  const filters = useMemo<BookingListFilters>(
    () => ({
      ...(customRange ? { fromDate: customRange.from, toDate: customRange.to } : {}),
      ...(statusFilter.length ? { statuses: statusFilter } : {}),
      ...(hotelFilter.length ? { hotelIds: hotelFilter } : {}),
      ...(therapistFilter.length ? { therapistIds: therapistFilter } : {}),
      ...(paymentMethodFilter.length ? { paymentMethods: paymentMethodFilter } : {}),
      ...(paymentStatusFilter.length ? { paymentStatuses: paymentStatusFilter } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [
      customRange,
      statusFilter,
      hotelFilter,
      therapistFilter,
      paymentMethodFilter,
      paymentStatusFilter,
      debouncedSearch,
    ],
  );

  const sort = useMemo<BookingListSort>(
    () => ({ key: sortKey, direction: sortDirection }),
    [sortKey, sortDirection],
  );

  const {
    bookings,
    total,
    hotels,
    therapists,
    getHotelInfo,
    fetchAllMatching,
    isLoading,
    hasMore,
    isLoadingMore,
    loadMore,
    refetch,
  } = useBookingsList({ filters, sort });

  // Lien externe `?id=` : uuid ou numéro de réservation. La cible n'est pas
  // forcément dans les lots chargés, on la résout donc en base.
  useEffect(() => {
    const param = searchParams.get("id");
    if (!param) return;

    // replace: true évite d'empiler l'entrée `?id=...` dans l'historique,
    // sinon le bouton "retour" y revient et re-déclenche cette redirection (boucle).
    if (!/^\d+$/.test(param)) {
      navigate(`/admin/bookings/${param}`, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id")
        .eq("booking_id", Number(param))
        .maybeSingle();
      if (!cancelled && data) navigate(`/admin/bookings/${data.id}`, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  const handleSort = (key: BookingSortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const { selectedBooking } = useBookingSelection({
    bookings,
    onOpenEdit: () => setIsEditDialogOpen(true),
  });

  useOverflowControl(true);

  const headerRef = useRef<HTMLDivElement>(null);

  const handleBookingClick = (booking: typeof selectedBooking) => {
    if (booking) {
      navigate(`/admin/bookings/${booking.id}`);
    }
  };

  // La plage personnalisée vit sur la page, pas dans le hook : le reset doit
  // la remettre à zéro aussi, sinon le bouton resterait affiché après un clic.
  const handleResetFilters = () => {
    resetFilters();
    setCustomRange(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Exporte toutes les réservations correspondant aux filtres, pas seulement
  // les lots déjà chargés. Une ligne = une réservation ; les prestations sont
  // jointes dans une colonne.
  const handleExportCsv = async () => {
    if (total === 0) {
      toast.info(t("bookings.export.empty"));
      return;
    }
    setIsExporting(true);
    let rows: BookingWithTreatments[];
    try {
      rows = await fetchAllMatching();
    } catch {
      toast.error(t("bookings.export.failed"));
      return;
    } finally {
      setIsExporting(false);
    }
    if (rows.length === 0) {
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
        value: (b) => getBookingStatusConfig(b.status).label || b.status || "",
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
    downloadCsv(buildCsv(rows, columns), `reservations_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success(t("bookings.export.success", { count: rows.length }));
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-3 md:pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            {t("bookingsList.title")}
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
                  {t("common:actions")}
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
                      {t("bookingsList.createPaymentLink")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        setQuickAction("refund");
                        setIsQuickActionsOpen(true);
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t("bookingsList.refundBooking")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={isExporting}
                  // L'export part chercher toutes les lignes filtrées : garder le
                  // menu ouvert évite de croire que rien ne s'est passé.
                  onSelect={(e) => {
                    e.preventDefault();
                    handleExportCsv();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? t("bookingsList.exporting") : t("bookingsList.exportCsv")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-8 text-xs">
              {isConcierge ? t("bookingsList.newRequest") : t("bookingsList.newBooking")}
            </Button>
          </div>
        </div>

        <BookingFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          hotelFilter={hotelFilter}
          onHotelChange={setHotelFilter}
          therapistFilter={therapistFilter}
          onTherapistChange={setTherapistFilter}
          paymentMethodFilter={paymentMethodFilter}
          onPaymentMethodChange={setPaymentMethodFilter}
          paymentStatusFilter={paymentStatusFilter}
          onPaymentStatusChange={setPaymentStatusFilter}
          view="list"
          onViewChange={() => {}}
          dayCount={5}
          onDayCountChange={() => {}}
          isAdmin={isAdmin}
          hotels={hotels}
          therapists={therapists}
          hideViewToggle
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          filterVisibilityStorageKey="bookingsList.visibleFilters"
          onResetFilters={handleResetFilters}
        />
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 min-h-0 min-w-0">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col min-w-0 overflow-hidden">
          {isLoading ? (
            <AppLoader fullScreen={false} className="flex-1" />
          ) : (
          <BookingListView
            paginatedBookings={bookings}
            filteredBookingsCount={bookings.length}
            emptyRowsCount={0}
            columns={columnPreferences.visibleColumns}
            onBookingClick={handleBookingClick}
            getHotelInfo={getHotelInfo}
            isConcierge={isConcierge}
            totalItems={total}
            paymentAsText
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onColumnResize={columnPreferences.setWidth}
            onColumnResizeReset={columnPreferences.resetWidth}
            scrollable
            onLoadMore={loadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
          )}
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
