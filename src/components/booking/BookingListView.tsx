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
import { FileText } from "lucide-react";
import { TablePagination } from "@/components/table/TablePagination";
import { formatPrice } from "@/lib/formatPrice";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden overflow-x-auto bg-card">
        <Table className="text-xs w-full table-fixed h-full min-w-[900px]">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b h-8 bg-muted/20">
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Réservation</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Date</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Heure</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Statut</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center">Paiement</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Client</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Total</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hôtel</TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Thérapeute</TableHead>
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
                <TableCell className="font-medium text-primary h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">#{booking.booking_id}</span>
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">{format(new Date(booking.booking_date), "dd-MM-yyyy")}</span>
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">{booking.booking_time.substring(0, 5)}</span>
                </TableCell>
                <TableCell className="h-12 py-0 px-2 overflow-hidden">
                  <StatusBadge status={booking.status} type="booking" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                </TableCell>
                <TableCell className="h-12 py-0 px-2 overflow-hidden text-center">
                  {booking.status !== 'quote_pending' && booking.status !== 'waiting_approval' && (
                    <StatusBadge
                      status={booking.payment_status || "pending"}
                      type="payment"
                      className="text-base px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
                    />
                  )}
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">{booking.client_first_name} {booking.client_last_name}</span>
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">{formatPrice(booking.total_price, getHotelInfo(booking.hotel_id)?.currency || 'EUR')}</span>
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <HotelCell hotel={getHotelInfo(booking.hotel_id)} />
                </TableCell>
                <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                  <span className="truncate block leading-none">{booking.therapist_name || "-"}</span>
                </TableCell>
                <TableCell className="h-12 py-0 px-2 overflow-hidden text-center">
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
