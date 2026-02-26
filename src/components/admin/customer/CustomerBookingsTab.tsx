import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { Calendar } from "lucide-react";

interface CustomerBookingsTabProps {
  customerId: string;
}

export function CustomerBookingsTab({ customerId }: CustomerBookingsTabProps) {
  const { t } = useTranslation("admin");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["customer-bookings", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, booking_time, status, total_price,
          hotels!bookings_hotel_id_fkey(id, name, currency),
          therapists:therapists!bookings_hairdresser_id_fkey(id, first_name, last_name)
        `)
        .eq("customer_id", customerId)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "confirmed": return "default";
      case "completed": return "secondary";
      case "cancelled": return "destructive";
      case "pending": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table className="text-xs w-full min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-8">
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                {t("customers.bookingHistory.date")}
              </TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                {t("customers.bookingHistory.time")}
              </TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                {t("customers.bookingHistory.venue")}
              </TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                {t("customers.bookingHistory.therapist")}
              </TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                {t("customers.bookingHistory.status")}
              </TableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right">
                {t("customers.bookingHistory.total")}
              </TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : bookings.length === 0 ? (
            <TableEmptyState
              colSpan={6}
              icon={Calendar}
              message={t("customers.bookingHistory.noBookings")}
            />
          ) : (
            <TableBody>
              {bookings.map((booking) => {
                const hotel = booking.hotels as any;
                const therapist = booking.therapists as any;
                return (
                  <TableRow key={booking.id} className="h-10">
                    <TableCell className="py-0 px-2 text-foreground">
                      {booking.booking_date
                        ? format(new Date(booking.booking_date), "dd/MM/yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="py-0 px-2 text-foreground">
                      {booking.booking_time
                        ? booking.booking_time.slice(0, 5)
                        : "-"}
                    </TableCell>
                    <TableCell className="py-0 px-2 text-foreground">
                      {hotel?.name || "-"}
                    </TableCell>
                    <TableCell className="py-0 px-2 text-foreground">
                      {therapist
                        ? `${therapist.first_name} ${therapist.last_name}`
                        : "-"}
                    </TableCell>
                    <TableCell className="py-0 px-2">
                      <Badge variant={getStatusVariant(booking.status || "")}>
                        {booking.status || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-0 px-2 text-foreground text-right">
                      {booking.total_price != null
                        ? `${Number(booking.total_price).toFixed(2)} ${hotel?.currency || "EUR"}`
                        : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  );
}
