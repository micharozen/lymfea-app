import { Fragment, useRef } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronsUpDown, ChevronUp, Clock, DoorOpen, Layers, Package, Users, X } from "lucide-react";
import { canCancelBookingByStatus } from "@/lib/cancelBookingRules";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { TablePagination, type PageSize } from "@/components/table/TablePagination";
import { computeResizedWidth } from "@/hooks/useColumnPreferences";
import { formatPrice } from "@/lib/formatPrice";
import { StatusBadge } from "@/components/StatusBadge";
import { effectivePaymentStatus } from "@/lib/clientTypePayment";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";
import {
  BOOKING_COLUMNS,
  columnHeadClass,
  getPaymentTextLabel,
  type BookingCellContext,
  type BookingColumnDef,
  type BookingSortKey,
  type SortDirection,
} from "./bookingColumns";

export type { BookingSortKey, SortDirection };

/** Options de la barre de tri mobile — dérivées des colonnes triables. */
const SORT_OPTIONS = BOOKING_COLUMNS.filter((c) => c.sortKey).map((c) => ({
  key: c.sortKey as BookingSortKey,
  label: c.sortLabel ?? c.label,
  hideForConcierge: c.hideForConcierge ?? false,
}));

const DEFAULT_COLUMNS = BOOKING_COLUMNS.filter((c) => c.defaultVisible);

interface BookingListViewProps {
  paginatedBookings: BookingWithTreatments[];
  filteredBookingsCount: number;
  emptyRowsCount: number;
  /**
   * Colonnes visibles, dans l'ordre. Omis ⇒ jeu par défaut (comportement
   * historique) : seul /admin/bookings pilote ses colonnes.
   */
  columns?: BookingColumnDef[];
  onBookingClick: (booking: BookingWithTreatments) => void;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  isAdmin?: boolean;
  isConcierge: boolean;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  paymentAsText?: boolean;
  onRequestCancel?: (booking: BookingWithTreatments) => void;
  sortKey?: BookingSortKey;
  sortDirection?: SortDirection;
  onSort?: (key: BookingSortKey) => void;
  /** Fournir pour activer le redimensionnement des colonnes à la souris. */
  onColumnResize?: (key: string, width: number) => void;
  /** Double-clic sur la poignée : rend son poids déclaré à la colonne. */
  onColumnResizeReset?: (key: string) => void;
  pageSize?: PageSize;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: PageSize) => void;
  /** Quand true, le tableau défile verticalement (taille de page fixe > écran). */
  scrollable?: boolean;
}

export function BookingListView({
  paginatedBookings,
  filteredBookingsCount,
  emptyRowsCount,
  columns,
  onBookingClick,
  getHotelInfo,
  isAdmin = false,
  isConcierge,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  paymentAsText = false,
  onRequestCancel,
  sortKey,
  sortDirection,
  onSort,
  onColumnResize,
  onColumnResizeReset,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  scrollable = false,
}: BookingListViewProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  // Le filtre concierge reste porté par la config, pas par les appelants.
  const visibleColumns = (columns ?? DEFAULT_COLUMNS).filter(
    (column) => !(isConcierge && column.hideForConcierge)
  );
  // +1 pour la colonne d'actions, qui n'a pas d'en-tête.
  const totalColumns = visibleColumns.length + 1;
  const totalWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) || 1;
  const cellContext: BookingCellContext = { getHotelInfo, navigate, t, paymentAsText };

  // Le redimensionnement raisonne en poids : on convertit le déplacement en px
  // via la largeur rendue de la table, d'où ce ref.
  const tableRef = useRef<HTMLTableElement>(null);

  const startResize = (column: BookingColumnDef, event: React.PointerEvent) => {
    if (!onColumnResize) return;
    // Sans ça, le pointerdown déclenche le tri de la colonne.
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = column.width;
    const tableWidth = tableRef.current?.getBoundingClientRect().width ?? 0;

    const onMove = (moveEvent: PointerEvent) => {
      onColumnResize(
        column.key,
        computeResizedWidth(startWidth, moveEvent.clientX - startX, tableWidth, totalWidth)
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Le curseur doit rester "col-resize" même quand la souris sort de la poignée.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const renderResizeHandle = (column: BookingColumnDef) => {
    if (!onColumnResize) return null;
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Redimensionner ${column.label}`}
        onPointerDown={(e) => startResize(column, e)}
        onDoubleClick={() => onColumnResizeReset?.(column.key)}
        // Le `truncate` de l'en-tête pose overflow:hidden : la poignée doit
        // rester à l'intérieur de la cellule pour ne pas être rognée.
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/2 after:h-1/2 after:w-px after:-translate-y-1/2 after:bg-border hover:after:h-full hover:after:w-0.5 hover:after:bg-primary"
      />
    );
  };

  const renderHead = (column: BookingColumnDef) => {
    const className = `relative ${columnHeadClass(column)}`;
    if (!onSort || !column.sortKey) {
      return (
        <TableHead className={className}>
          {column.label}
          {renderResizeHandle(column)}
        </TableHead>
      );
    }
    const key = column.sortKey;
    const isActive = sortKey === key;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => onSort(key)}
          className={`flex items-center gap-1 hover:text-foreground transition-colors ${
            column.align === "center" ? "mx-auto" : ""
          } ${isActive ? "text-foreground" : ""}`}
        >
          <span className="truncate">{column.label}</span>
          {!isActive && <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
          {isActive && sortDirection === "asc" && <ChevronUp className="h-3 w-3 shrink-0" />}
          {isActive && sortDirection === "desc" && <ChevronDown className="h-3 w-3 shrink-0" />}
        </button>
        {renderResizeHandle(column)}
      </TableHead>
    );
  };

  const canShowCancel = (booking: BookingWithTreatments) =>
    !!onRequestCancel &&
    (isAdmin || isConcierge) &&
    canCancelBookingByStatus(booking.status);

  const renderCancelButton = (booking: BookingWithTreatments) => {
    if (!canShowCancel(booking)) return null;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRequestCancel?.(booking)}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("cancelBookingDialog.listCancelTooltip")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="h-full flex flex-col min-w-0">
      {/* ── Mobile sort bar (<md) ──────────────────────────── */}
      {onSort && sortKey && (
        <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
          <span className="text-xs text-muted-foreground shrink-0">Trier par</span>
          <Select value={sortKey} onValueChange={(v) => onSort(v as BookingSortKey)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.filter((o) => !(isConcierge && o.hideForConcierge)).map((o) => (
                <SelectItem key={o.key} value={o.key} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onSort(sortKey)}
            title={sortDirection === "asc" ? "Croissant" : "Décroissant"}
          >
            {sortDirection === "asc" ? (
              <ArrowUpNarrowWide className="h-4 w-4" />
            ) : (
              <ArrowDownNarrowWide className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {/* ── Mobile card view (<md) ─────────────────────────── */}
      <div className="flex flex-col md:hidden flex-1 overflow-y-auto divide-y divide-border">
        {paginatedBookings.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Aucune réservation trouvée</p>
        )}
        {paginatedBookings.map((booking) => {
          const hotel = getHotelInfo(booking.hotel_id);
          const firstInitial = booking.client_first_name
            ? `${booking.client_first_name.charAt(0).toUpperCase()}.`
            : "";
          const clientLabel = [firstInitial, booking.client_last_name].filter(Boolean).join(" ");
          const customerId = (booking as any).customer_id as string | undefined;
          // Statut affiché : une facturation partenaire est stockée "paid" mais
          // reste présentée comme "Paiement partenaire".
          const displayPaymentStatus = effectivePaymentStatus(
            booking.payment_method,
            booking.payment_status,
          );

          return (
            <div
              key={booking.id}
              className="p-3 cursor-pointer hover:bg-muted/40 transition-colors active:bg-muted/60"
              onClick={() => onBookingClick(booking)}
            >
              {/* Top row: booking id + date + total */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-primary text-sm shrink-0">
                    #{booking.booking_id}
                  </span>
                  {(booking as any).bundle_usage_id && (
                    <Package className="h-3 w-3 text-amber-600 shrink-0" title="Séance cure" />
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(booking.booking_date), "dd/MM/yyyy")} · {booking.booking_time.substring(0, 5)}
                  </span>
                  {booking.totalDuration && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {booking.totalDuration} min
                    </span>
                  )}
                </div>
                <span className="font-medium text-sm shrink-0 flex items-center gap-1">
                  {booking.payment_status === "offert"
                    ? t("admin:bookings.offert.tag")
                    : formatPrice(booking.total_price, hotel?.currency || "EUR")}
                  {booking.is_out_of_hours && (
                    <Clock className="h-3 w-3 text-amber-500 shrink-0" title="Hors horaires" />
                  )}
                </span>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <StatusBadge
                  status={booking.status}
                  type="booking"
                  className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                />
                {booking.status !== "quote_pending" && booking.status !== "waiting_approval" && (
                  <StatusBadge
                    status={displayPaymentStatus}
                    type="payment"
                    className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                    customLabel={getPaymentTextLabel(displayPaymentStatus)}
                  />
                )}
                {(booking as any).guest_count > 1 &&
                  booking.status === "pending" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap font-medium"
                      title={`Soin duo — ${(booking as any).guest_count} praticiens nécessaires`}
                    >
                      <Users className="h-2.5 w-2.5" />
                      {(booking as any).booking_therapists?.filter((bt: any) => bt.status === "accepted").length || 0}/{(booking as any).guest_count}
                    </span>
                  )}
                {(booking as any).guest_count > 1 && booking.status === "confirmed" && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap font-medium">
                    <Users className="h-2.5 w-2.5" /> Duo
                  </span>
                )}
                {(booking as any).booking_group_id && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap font-medium">
                    <Layers className="h-2.5 w-2.5" /> Groupé
                  </span>
                )}
              </div>

              {/* Bottom row: client info */}
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0 text-xs text-foreground space-y-0.5">
                  {customerId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/customers/${customerId}`);
                      }}
                      className="font-medium hover:underline hover:text-primary truncate block text-left"
                    >
                      {clientLabel}
                    </button>
                  ) : (
                    <span className="font-medium truncate block">{clientLabel}</span>
                  )}
                  <span className="text-muted-foreground truncate block">
                    {booking.treatments.length > 0
                      ? booking.treatments.map((t) => t.name).join(", ")
                      : "-"}
                  </span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {booking.therapist_name && (
                      <span className="truncate">{booking.therapist_name}</span>
                    )}
                    {!isConcierge && hotel && (
                      <span className="truncate">{hotel.name}</span>
                    )}
                    {booking.room_name && (
                      <span className="truncate flex items-center gap-1">
                        <DoorOpen className="h-3 w-3 shrink-0" />
                        {booking.room_name}
                        {booking.secondary_room_name && ` + ${booking.secondary_room_name}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {renderCancelButton(booking)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table view (≥md) ────────────────────────── */}
      <div
        className={`hidden md:flex flex-1 overflow-x-auto bg-card flex-col ${
          scrollable ? "overflow-y-auto" : "overflow-y-hidden"
        }`}
      >
        <Table
          ref={tableRef}
          className="text-xs w-full table-fixed"
          style={{ minWidth: Math.max(960, visibleColumns.length * 90) }}
        >
          <colgroup>
            {visibleColumns.map((column) => (
              // 95 % pour les colonnes de données, le reste pour les actions.
              <col key={column.key} style={{ width: `${(column.width / totalWidth) * 95}%` }} />
            ))}
            <col style={{ width: "5%" }} />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b h-8 bg-muted/20">
              {visibleColumns.map((column) => (
                <Fragment key={column.key}>{renderHead(column)}</Fragment>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedBookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="cursor-pointer border-b hover:bg-muted/50 transition-colors group"
                onClick={() => onBookingClick(booking)}
              >
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={`text-foreground py-3 px-2 truncate ${
                      column.align === "center" ? "text-center overflow-hidden" : ""
                    }`}
                  >
                    {column.cell(booking, cellContext)}
                  </TableCell>
                ))}
                <TableCell className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                  {renderCancelButton(booking)}
                </TableCell>
              </TableRow>
            ))}

            {filteredBookingsCount > 0 &&
              Array.from({ length: emptyRowsCount }).map((_, idx) => (
                <TableRow key={`empty-${idx}`} className="h-12 border-b" aria-hidden>
                  <TableCell colSpan={totalColumns} className="h-12 py-0 px-2">&nbsp;</TableCell>
                </TableRow>
              ))}

            {filteredBookingsCount === 0 && (
              <TableRow>
                <TableCell colSpan={totalColumns} className="text-center text-muted-foreground py-6">
                  No bookings found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
        itemName="réservations"
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
