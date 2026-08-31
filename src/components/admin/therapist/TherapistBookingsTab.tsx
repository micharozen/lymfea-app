

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
import {
  computeLegEarnings,
  type TherapistRates,
  type TreatmentRateMap,
} from "@/lib/therapistEarnings";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface BookingTreatmentRow {
  therapist_id: string | null;
  treatment_id: string | null;
  treatment_menus: { duration: number | null } | null;
  treatment_variants: { duration: number | null } | null;
}

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_id: string | null;
  hotel_name: string | null;
  status: string;
  total_price: number | null;
  duration: number | null;
  is_out_of_hours: boolean | null;
  booking_treatments: BookingTreatmentRow[] | null;
  /** Rémunération du thérapeute : payout si présent, sinon calcul par durée. */
  earnings: number | null;
}

interface TherapistBookingsTabProps {
  therapistId: string;
}

const ITEMS_PER_PAGE = 15;

/** Une réservation annulée ne rémunère pas le thérapeute (contrairement au no-show). */
const UNPAID_STATUSES = ["cancelled", "canceled"];

// La durée réellement réservée est celle de la variante quand il y en a une,
// sinon celle du soin au menu.
const treatmentDuration = (bt: BookingTreatmentRow): number =>
  bt.treatment_variants?.duration ?? bt.treatment_menus?.duration ?? 0;

/**
 * Rémunération du thérapeute par réservation. Le payout fait foi quand il existe
 * (une ligne par thérapeute sur les duos) ; sinon on retombe sur les tarifs à la
 * durée avec la majoration hors horaires du lieu — même logique que
 * `generate-therapist-invoices`.
 */
async function withEarnings(rows: Booking[], therapistId: string): Promise<Booking[]> {
  if (rows.length === 0) return rows;

  const bookingIds = rows.map((b) => b.id);
  const hotelIds = [...new Set(rows.map((b) => b.hotel_id).filter((id): id is string => !!id))];

  const [payoutsRes, therapistRes, hotelsRes] = await Promise.all([
    supabase
      .from("therapist_payouts")
      .select("booking_id, amount")
      .eq("therapist_id", therapistId)
      .in("booking_id", bookingIds),
    supabase
      .from("therapists")
      .select(
        "rate_30, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150, treatment_rates, treatment_rates_active",
      )
      .eq("id", therapistId)
      .maybeSingle(),
    supabase
      .from("hotels")
      .select("id, out_of_hours_surcharge_percent")
      .in("id", hotelIds.length > 0 ? hotelIds : ["__none__"]),
  ]);

  const payoutByBooking = new Map<string, number>(
    (payoutsRes.data ?? []).map((p) => [p.booking_id, Number(p.amount)]),
  );
  const surchargeByHotel = new Map<string, number>(
    (hotelsRes.data ?? []).map((h) => [h.id, Number(h.out_of_hours_surcharge_percent) || 0]),
  );
  const rates = (therapistRes.data ?? null) as TherapistRates | null;
  // Le flag est honoré ici : le moteur ne reçoit jamais une map inactive.
  const therapistRow = therapistRes.data as
    | { treatment_rates: TreatmentRateMap | null; treatment_rates_active: boolean | null }
    | null;
  const treatmentRates = therapistRow?.treatment_rates_active
    ? therapistRow.treatment_rates ?? null
    : null;

  return rows.map((booking) => {
    if (UNPAID_STATUSES.includes(booking.status)) return { ...booking, earnings: null };

    const payout = payoutByBooking.get(booking.id);
    if (payout !== undefined) return { ...booking, earnings: payout };

    const treatments = booking.booking_treatments ?? [];
    // Quand le lien stable soin↔thérapeute existe, le thérapeute est payé sur la
    // somme de SES soins ; sinon on retombe sur la durée de la réservation.
    const linkedDuration = treatments.some((bt) => bt.therapist_id != null)
      ? treatments
          .filter((bt) => bt.therapist_id === therapistId)
          .reduce((sum, bt) => sum + treatmentDuration(bt), 0)
      : 0;
    const duration = linkedDuration > 0
      ? linkedDuration
      : booking.duration && booking.duration > 0
      ? booking.duration
      : treatments.reduce((sum, bt) => sum + treatmentDuration(bt), 0);

    const surchargePercent = booking.hotel_id
      ? surchargeByHotel.get(booking.hotel_id) ?? 0
      : 0;

    return {
      ...booking,
      earnings: computeLegEarnings(
        rates,
        treatmentRates,
        {
          totalDuration: duration,
          // Les lignes du thérapeute quand le lien stable existe, sinon toutes :
          // même périmètre que la durée calculée juste au-dessus.
          lines: (linkedDuration > 0
            ? treatments.filter((bt) => bt.therapist_id === therapistId)
            : treatments
          ).map((bt) => ({
            treatment_id: bt.treatment_id ?? null,
            duration: treatmentDuration(bt),
          })),
        },
        booking.is_out_of_hours ? { surchargePercent } : undefined,
      ),
    };
  });
}

export function TherapistBookingsTab({ therapistId }: TherapistBookingsTabProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
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
      const { data: btData } = await (supabase as any)
        .from('booking_therapists')
        .select('booking_id')
        .eq('therapist_id', therapistId)
        .eq('status', 'accepted');

      const myBookingIds = (btData as any[])?.map(bt => bt.booking_id) || [];

      // 2. Préparer la requête principale
      let query = supabase
        .from("bookings")
        .select(
          "id, booking_id, booking_date, booking_time, client_first_name, client_last_name, hotel_id, hotel_name, status, total_price, duration, is_out_of_hours, booking_treatments(therapist_id, treatment_id, treatment_menus(duration), treatment_variants(duration))",
        )
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

      const rows = (data || []) as unknown as Booking[];
      setBookings(await withEarnings(rows, therapistId));
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
        case "earnings": return booking.earnings ?? 0;
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
        <Table className="text-xs w-full min-w-[780px]">
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
              <SortableTableHead
                column="earnings"
                sortDirection={getSortDirection("earnings")}
                onSort={toggleSort}
              >
                {t("therapists.bookingsTab.earnings")}
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={ITEMS_PER_PAGE} columns={7} />
          ) : paginatedBookings.length === 0 ? (
            <TableEmptyState
              colSpan={7}
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
                    <TableCell className="py-1.5 px-2 text-right">
                      <span className="text-foreground font-medium">
                        {booking.earnings != null
                          ? formatPrice(booking.earnings, "EUR")
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