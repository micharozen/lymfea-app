

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { getBookingStatusConfig } from "@/utils/statusStyles";
import { formatPrice } from "@/lib/formatPrice";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string | null;
  status: string;
  total_price: number | null;
}

interface TherapistBookingsTabProps {
  therapistId: string;
}

const ITEMS_PER_PAGE = 15;

export function TherapistBookingsTab({ therapistId }: TherapistBookingsTabProps) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const fetchBookings = useCallback(async () => {
    try {
      // 1. Récupérer les IDs de réservation depuis la table de liaison (Soins Duo)
// 1. Récupérer les IDs de réservation depuis la table de liaison (Soins Duo)
      const { data: btData } = await (supabase as any)
        .from('booking_therapists')
        .select('booking_id')
        .eq('therapist_id', therapistId);

      const myBookingIds = (btData as any[])?.map(bt => bt.booking_id) || [];

      // 2. Préparer la requête principale
      let query = supabase
        .from("bookings")
        .select("id, booking_id, booking_date, booking_time, client_first_name, client_last_name, hotel_name, status, total_price")
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false });

      // 3. Appliquer le filtre : Soit Praticien Principal, soit dans la table de liaison
      if (myBookingIds.length > 0) {
        query = query.or(`therapist_id.eq.${therapistId},id.in.(${myBookingIds.join(',')})`);
      } else {
        query = query.eq("therapist_id", therapistId);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setBookings((data || []) as Booking[]);
    } catch (error) {
      console.error("Error fetching therapist bookings:", error);
      toast.error(isFr ? "Erreur de chargement" : "Loading error");
    } finally {
      setLoading(false);
    }
  }, [therapistId, statusFilter, isFr]);

  useEffect(() => {
    setLoading(true);
    fetchBookings();
  }, [fetchBookings]);

  const sortedBookings = useMemo(() => {
    return sortItems(bookings, (booking, column) => {
      switch (column) {
        case "date": return booking.booking_date;
        case "time": return booking.booking_time;
        case "client": return `${booking.client_first_name} ${booking.client_last_name}`;
        case "venue": return booking.hotel_name || "";
        case "status": return booking.status;
        case "amount": return booking.total_price?.toString() || "0";
        default: return null;
      }
    });
  }, [bookings, sortItems]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginatedBookings,
    needsPagination,
  } = usePagination({ items: sortedBookings, itemsPerPage: ITEMS_PER_PAGE });

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col">
      <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("therapists.bookingsTab.allStatuses")}</SelectItem>
            <SelectItem value="pending">{t("therapists.bookingsTab.pending")}</SelectItem>
            <SelectItem value="confirmed">{t("therapists.bookingsTab.confirmed")}</SelectItem>
            <SelectItem value="ongoing">{t("therapists.bookingsTab.ongoing")}</SelectItem>
            <SelectItem value="completed">{t("therapists.bookingsTab.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("therapists.bookingsTab.cancelled")}</SelectItem>
            <SelectItem value="noshow">{t("therapists.bookingsTab.noshow")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-xs w-full min-w-[700px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-8">
              <SortableTableHead
                column="date"
                sortDirection={getSortDirection("date")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.date")}
              </SortableTableHead>
              <SortableTableHead
                column="time"
                sortDirection={getSortDirection("time")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.time")}
              </SortableTableHead>
              <SortableTableHead
                column="client"
                sortDirection={getSortDirection("client")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.client")}
              </SortableTableHead>
              <SortableTableHead
                column="venue"
                sortDirection={getSortDirection("venue")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.venue")}
              </SortableTableHead>
              <SortableTableHead
                column="status"
                sortDirection={getSortDirection("status")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.status")}
              </SortableTableHead>
              <SortableTableHead
                column="amount"
                sortDirection={getSortDirection("amount")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.amount")}
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={ITEMS_PER_PAGE} columns={6} />
          ) : paginatedBookings.length === 0 ? (
            <TableEmptyState
              colSpan={6}
              icon={Calendar}
              message={t("therapists.bookingsTab.noBookings")}
              description={t("therapists.bookingsTab.noBookingsDesc")}
            />
          ) : (
            <TableBody>
              {paginatedBookings.map((booking) => {
                const statusConfig = getBookingStatusConfig(booking.status);

                return (
                  <TableRow
                    key={booking.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                  >
                    <TableCell className="py-1.5 px-2">
                      <span className="text-foreground">
                        {format(new Date(booking.booking_date + "T00:00:00"), "EEE d MMM", { locale })}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <span className="text-foreground">
                        {booking.booking_time?.slice(0, 5)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <span className="text-foreground font-medium">
                        {booking.client_first_name} {booking.client_last_name}
                      </span>
                      <span className="text-muted-foreground ml-1.5 text-[10px]">
                        #{booking.booking_id}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <span className="text-muted-foreground">
                        {booking.hotel_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${statusConfig.badgeClass}`}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right">
                      <span className="text-foreground font-medium">
                        {booking.total_price != null
                          ? formatPrice(booking.total_price, "EUR")
                          : "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </Table>
      </div>

      {needsPagination && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedBookings.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemName={isFr ? "réservations" : "bookings"}
        />
      )}
    </div>
  );
}