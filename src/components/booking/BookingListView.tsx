import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, FileText, Package, Users } from "lucide-react";
import { TablePagination } from "@/components/table/TablePagination";
import { formatPrice } from "@/lib/formatPrice";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import { ClientTypeBadge } from "@/components/booking/ClientTypeBadge";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

const PAYMENT_TEXT_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  failed: "Échec",
  refunded: "Remboursé",
  charged_to_room: "Chambre",
  pending_partner_billing: "Partenaire",
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
  isAdmin: boolean;
  isConcierge: boolean;
  onInvoicePreview: (html: string, bookingId: number, isRoomPayment: boolean) => void;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  paymentAsText?: boolean;
}

export function BookingListView({
  paginatedBookings,
  filteredBookingsCount,
  emptyRowsCount,
  totalColumns,
  onBookingClick,
  getHotelInfo,
  isAdmin,
  isConcierge,
  onInvoicePreview,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  paymentAsText = false,
}: BookingListViewProps) {
  const handleInvoiceClick = async (
    e: React.MouseEvent,
    booking: BookingWithTreatments,
    isRoomPayment: boolean
  ) => {
    e.stopPropagation();

    if (booking.stripe_invoice_url) {
      window.open(booking.stripe_invoice_url, "_blank");
      return;
    }

    const { data, error } = await invokeEdgeFunction<unknown, { html: string; bookingId: string }>("generate-invoice", {
      body: { bookingId: booking.id },
    });

    if (!error && data) {
      onInvoicePreview(data.html, data.bookingId, isRoomPayment);
    }
  };

  return (
    <div className="h-full flex flex-col min-w-0">
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-card">
        <Table className="text-xs w-full table-fixed">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[8%]" />
            <col className="w-[5%]" />
            <col className="w-[5%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[5%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b h-8 bg-muted/20">
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Réservation</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Date</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Heure</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Durée</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Statut</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center">Paiement</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Client</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Prestations</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Total</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Hôtel</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">Thérapeute</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center">Facture</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedBookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="cursor-pointer border-b hover:bg-muted/50 transition-colors"
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
                  <div className="flex items-center gap-1">
                    <StatusBadge status={booking.status} type="booking" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                    {(booking as any).guest_count > 1 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap" title={`${(booking as any).guest_count} personnes`}>
                        <Users className="h-2.5 w-2.5" />
                        {(booking as any).guest_count}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-3 px-2 text-center">
                  {booking.status !== 'quote_pending' && booking.status !== 'waiting_approval' && (
                    <div className="inline-flex items-center gap-1">
                      <StatusBadge
                        status={booking.payment_status || "pending"}
                        type="payment"
                        className={
                          paymentAsText
                            ? "text-[10px] px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
                            : "text-base px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
                        }
                        customLabel={paymentAsText ? getPaymentTextLabel(booking.payment_status) : undefined}
                      />
                      {booking.payment_method === 'partner_billed' && (booking as any).client_type && (
                        <ClientTypeBadge clientType={(booking as any).client_type} size="sm" />
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-none">{booking.client_first_name} {booking.client_last_name}</span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-snug">
                    {booking.treatments.length > 0
                      ? booking.treatments.map(t => t.name).join(", ")
                      : "-"}
                  </span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="leading-none flex items-center gap-1">
                    {formatPrice(booking.total_price, getHotelInfo(booking.hotel_id)?.currency || 'EUR')}
                    {booking.is_out_of_hours && (
                      <Clock className="h-3 w-3 text-amber-500 shrink-0" title="Hors horaires" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <HotelCell hotel={getHotelInfo(booking.hotel_id)} />
                </TableCell>
                <TableCell className="text-foreground py-3 px-2">
                  <span className="block leading-none">{booking.therapist_name || "-"}</span>
                </TableCell>
                <TableCell className="py-3 px-2 text-center">
                  {booking.status !== 'quote_pending' && booking.status !== 'waiting_approval' && (() => {
                    const isCompleted = booking.status === "completed" || booking.payment_status === "paid" || booking.payment_status === "charged_to_room";
                    const isRoomPayment = booking.payment_method === "room";
                    const hasStripeInvoice = !!booking.stripe_invoice_url;

                    if (isAdmin && isCompleted) {
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="inline-flex items-center justify-center gap-1.5 w-20 py-1 text-xs font-medium rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all"
                                onClick={(e) => handleInvoiceClick(e, booking, isRoomPayment)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>{hasStripeInvoice ? "Facture" : "Bon"}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {hasStripeInvoice
                                ? "Voir la Facture Stripe"
                                : "Télécharger le Bon de Prestation"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    }

                    if (isConcierge && isCompleted && isRoomPayment) {
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="inline-flex items-center justify-center gap-1.5 w-20 py-1 text-xs font-medium rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all"
                                onClick={(e) => handleInvoiceClick(e, booking, true)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>Bon</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Télécharger le Bon de Prestation
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    }

                    return null;
                  })()}
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
