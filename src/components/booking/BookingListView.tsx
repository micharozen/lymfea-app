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
import { Clock, Layers, Package, Users, X } from "lucide-react";
import { canCancelBookingByStatus } from "@/lib/cancelBookingRules";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/table/TablePagination";
import { formatPrice } from "@/lib/formatPrice";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

const PAYMENT_TEXT_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  failed: "Échec",
  refunded: "Remboursé",
  charged_to_room: "Chambre",
  pending_partner_billing: "Paiement partenaire",
  card_saved: "Carte enregistrée",
};

function getPaymentTextLabel(status: string | null | undefined): string {
  if (!status) return "Non défini";
  return PAYMENT_TEXT_LABELS[status.toLowerCase()] ?? status;
}

interface BookingListViewProps {
  paginatedBookings: BookingWithTreatments[];
  filteredBookingsCount: number;
  emptyRowsCount: number;
  totalColumns: number;
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
}

export function BookingListView({
  paginatedBookings,
  filteredBookingsCount,
  emptyRowsCount,
  totalColumns,
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
}: BookingListViewProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

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
                  {formatPrice(booking.total_price, hotel?.currency || "EUR")}
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
                    status={booking.payment_status || "pending"}
                    type="payment"
                    className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                    customLabel={getPaymentTextLabel(booking.payment_status)}
                  />
                )}
                {(booking as any).guest_count > 1 &&
                  ["awaiting_hairdresser_selection", "pending"].includes(booking.status) && (
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
      <div className="hidden md:flex flex-1 overflow-x-auto overflow-y-hidden bg-card flex-col">
        <Table className="text-xs w-full min-w-[960px] table-fixed">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[7%]" />
            {!isConcierge && <col className="w-[10%]" />}
            <col className="w-[10%]" />
            <col className="w-[5%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b h-8 bg-muted/20">
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Réservation</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Date</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Heure</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Durée</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Statut</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center">Paiement</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Client</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Prestations</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Total</TableHead>
              {!isConcierge && (
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Lieu</TableHead>
              )}
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Thérapeute</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedBookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="cursor-pointer border-b hover:bg-muted/50 transition-colors group"
                onClick={() => onBookingClick(booking)}
              >
                <TableCell className="font-medium text-primary py-3 px-2">
                  <span className="leading-none flex items-center gap-1">
                    #{booking.booking_id}
                    {(booking as any).bundle_usage_id && (
                      <Package className="h-3 w-3 text-amber-600 shrink-0" title="Séance cure" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-none">{format(new Date(booking.booking_date), "dd-MM-yyyy")}</span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-none">{booking.booking_time.substring(0, 5)}</span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-none">{booking.totalDuration ? `${booking.totalDuration} min` : "-"}</span>
                </TableCell>
                <TableCell className="py-3 px-2">
                  <div className="flex flex-col gap-0.5 items-start">
                    <StatusBadge
                      status={booking.status}
                      type="booking"
                      className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                    />
                    {(booking as any).guest_count > 1 &&
                      ["awaiting_hairdresser_selection", "pending"].includes(booking.status) && (
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
                </TableCell>
                <TableCell className="py-3 px-2 text-center overflow-hidden">
                  {booking.status !== "quote_pending" && booking.status !== "waiting_approval" && (
                    <StatusBadge
                      status={booking.payment_status || "pending"}
                      type="payment"
                      className={
                        paymentAsText
                          ? "text-[10px] px-2 py-0.5 max-w-full truncate inline-flex items-center justify-center"
                          : "text-base px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
                      }
                      customLabel={paymentAsText ? getPaymentTextLabel(booking.payment_status) : undefined}
                    />
                  )}
                </TableCell>
                <TableCell className="text-foreground py-3 px-2 truncate">
                  {(() => {
                    const firstInitial = booking.client_first_name
                      ? `${booking.client_first_name.charAt(0).toUpperCase()}.`
                      : "";
                    const label = [firstInitial, booking.client_last_name].filter(Boolean).join(" ");
                    const customerId = (booking as any).customer_id as string | undefined;
                    return customerId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/customers/${customerId}`);
                        }}
                        className="block leading-tight truncate text-left hover:underline hover:text-primary"
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="block leading-tight truncate">{label}</span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-foreground py-3 px-2 truncate">
                  <span className="block leading-snug truncate">
                    {booking.treatments.length > 0
                      ? booking.treatments.map((t) => t.name).join(", ")
                      : "-"}
                  </span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="leading-none flex items-center gap-1">
                    {formatPrice(booking.total_price, getHotelInfo(booking.hotel_id)?.currency || "EUR")}
                    {booking.is_out_of_hours && (
                      <Clock className="h-3 w-3 text-amber-500 shrink-0" title="Hors horaires" />
                    )}
                  </span>
                </TableCell>
                {!isConcierge && (
                  <TableCell className="text-foreground py-3 px-2 truncate">
                    <HotelCell hotel={getHotelInfo(booking.hotel_id)} />
                  </TableCell>
                )}
                <TableCell className="text-foreground py-3 px-2 truncate">
                  <span className="block leading-tight truncate">{booking.therapist_name || "-"}</span>
                </TableCell>
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
      />
    </div>
  );
}
