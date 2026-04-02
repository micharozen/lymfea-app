import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
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
import { Calendar, CheckCircle2, XCircle } from "lucide-react";

interface CustomerBookingsTabProps {
  customerId: string;
}

export function CustomerBookingsTab({ customerId }: CustomerBookingsTabProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["customer-bookings", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, booking_time, status, total_price, signed_at,
          hotels!bookings_hotel_id_fkey(id, name, currency),
          therapists:therapists!bookings_hairdresser_id_fkey(id, first_name, last_name),
          booking_treatments(
            treatment_menus(name)
          )
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
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-xs w-full min-w-[800px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-10">
              <TableHead className="font-medium py-1.5 px-3">Date & Heure</TableHead>
              <TableHead className="font-medium py-1.5 px-3">Lieu</TableHead>
              <TableHead className="font-medium py-1.5 px-3">Soins</TableHead>
              <TableHead className="font-medium py-1.5 px-3">Praticien</TableHead>
              <TableHead className="font-medium py-1.5 px-3">Décharge</TableHead>
              <TableHead className="font-medium py-1.5 px-3">Statut</TableHead>
              <TableHead className="font-medium py-1.5 px-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : bookings.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              icon={Calendar}
              message={t("customers.bookingHistory.noBookings")}
            />
          ) : (
            <TableBody>
              {bookings.map((booking) => {
                const hotel = booking.hotels as any;
                const therapist = booking.therapists as any;
                
                // Extraction des noms des soins
                const treatmentNames = booking.booking_treatments
                  ?.map((bt: any) => bt.treatment_menus?.name)
                  .filter(Boolean)
                  .join(", ") || "-";

                return (
                  <TableRow 
                    key={booking.id} 
                    className="h-12 cursor-pointer hover:bg-muted/50 transition-colors group"
                    onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                  >
                    <TableCell className="py-2 px-3 font-medium">
                      <div className="flex flex-col">
                        <span>{booking.booking_date ? format(new Date(booking.booking_date), "dd/MM/yyyy") : "-"}</span>
                        <span className="text-muted-foreground font-normal">{booking.booking_time?.slice(0, 5)}</span>
                      </div>
                    </TableCell>
                    
                    <TableCell className="py-2 px-3">{hotel?.name || "-"}</TableCell>
                    
                    <TableCell className="py-2 px-3 max-w-[200px]">
                      <p className="truncate" title={treatmentNames}>{treatmentNames}</p>
                    </TableCell>

                    <TableCell className="py-2 px-3">
                      {therapist ? `${therapist.first_name} ${therapist.last_name}` : "-"}
                    </TableCell>

                    <TableCell className="py-2 px-3">
                      {booking.signed_at ? (
                        <div className="flex items-center gap-1 text-green-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Signée ({format(new Date(booking.signed_at), "dd/MM", { locale: fr })})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Non signée</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="py-2 px-3">
                      <Badge variant={getStatusVariant(booking.status || "")} className="capitalize">
                        {booking.status || "-"}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-2 px-3 text-right font-semibold">
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