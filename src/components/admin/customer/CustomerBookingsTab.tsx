import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
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

const formatPaymentText = (status: string | null) => {
  switch (status) {
    case 'charged_to_room':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 shadow-none font-medium">Facturé chambre</Badge>;
    case 'paid':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shadow-none font-medium">Payé</Badge>;
    case 'refunded':
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 shadow-none font-medium">Remboursé</Badge>;
    case 'failed':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 shadow-none font-medium">Échec</Badge>;
    case 'card_saved':
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 shadow-none font-medium">Carte enregistrée</Badge>;
    case 'pending':
    default:
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 shadow-none font-medium">En attente</Badge>;
  }
};

export function CustomerBookingsTab({ customerId }: CustomerBookingsTabProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["customer-bookings", customerId],
    queryFn: async () => {
      // 1. On récupère d'abord l'email et le téléphone du client
      const { data: customer } = await supabase
        .from("customers")
        .select("email, phone")
        .eq("id", customerId)
        .single();

      // 2. On construit une requête dynamique (customer_id OU email OU téléphone)
      let searchCondition = `customer_id.eq.${customerId}`;
      
      if (customer?.email && customer.email.trim() !== "") {
        searchCondition += `,client_email.eq.${customer.email}`;
      }
      if (customer?.phone && customer.phone.trim() !== "") {
        // Attention au format du numéro (avec ou sans +)
        searchCondition += `,phone.eq.${customer.phone}`;
      }

      // 3. On interroge les réservations avec cette condition large
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_id, booking_date, booking_time, status, payment_status, total_price, signed_at,
          hotels!bookings_hotel_id_fkey(id, name, currency),
          therapists:therapists!bookings_hairdresser_id_fkey(id, first_name, last_name),
          booking_treatments(treatment_menus(name))
        `)
        .or(searchCondition) // <-- La magie opère ici !
        .order("booking_date", { ascending: false });
      
      if (error) throw error;

      // 4. On déduplique au cas où une réservation matcherait plusieurs critères
      const uniqueBookings = Array.from(new Map(data?.map(item => [item.id, item])).values());
      
      return uniqueBookings || [];
    },
    enabled: !!customerId,
  });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border bg-white">
        <Table className="text-xs w-full min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-10">
              <TableHead className="font-medium px-3">N° Résa</TableHead>
              <TableHead className="font-medium px-3">Date & Heure</TableHead>
              <TableHead className="font-medium px-3">Lieu</TableHead>
              <TableHead className="font-medium px-3">Soins</TableHead>
              <TableHead className="font-medium px-3">Statut Booking</TableHead>
              <TableHead className="font-medium px-3">Paiement</TableHead>
              <TableHead className="font-medium px-3">Décharge</TableHead>
              <TableHead className="font-medium px-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : bookings.length === 0 ? (
            <TableEmptyState colSpan={8} icon={Calendar} message={t("customers.bookingHistory.noBookings")} />
          ) : (
            <TableBody>
              {bookings.map((booking: any) => {
                const hotel = booking.hotels as any;
                const treatmentNames = booking.booking_treatments
                  ?.map((bt: any) => bt.treatment_menus?.name)
                  .filter(Boolean).join(", ") || "-";

                return (
                  <TableRow 
                    key={booking.id} 
                    className="h-12 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                  >
                    <TableCell className="px-3 font-bold text-primary">#{booking.booking_id}</TableCell>
                    
                    <TableCell className="px-3">
                      <div className="flex flex-col">
                        <span>{booking.booking_date ? format(new Date(booking.booking_date), "dd/MM/yyyy") : "-"}</span>
                        <span className="text-muted-foreground">{booking.booking_time?.slice(0, 5)}</span>
                      </div>
                    </TableCell>

                    <TableCell className="px-3 text-muted-foreground font-medium">
                      {hotel?.name || "-"}
                    </TableCell>
                    
                    <TableCell className="px-3 max-w-[180px] truncate">{treatmentNames}</TableCell>

                    <TableCell className="px-3">
                      <StatusBadge status={booking.status} type="booking" />
                    </TableCell>

                    <TableCell className="px-3">
                      {formatPaymentText(booking.payment_status)}
                    </TableCell>

                    <TableCell className="px-3">
                      {booking.signed_at ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-300" />
                      )}
                    </TableCell>

                    <TableCell className="px-3 text-right font-bold">
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