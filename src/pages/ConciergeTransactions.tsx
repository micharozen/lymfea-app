import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  RefreshCw, 
  Euro, 
  Calendar,
  Search,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { StatusBadge } from "@/components/StatusBadge";

interface BookingTransaction {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  room_number: string | null;
  client_first_name: string;
  client_last_name: string;
  hairdresser_name: string | null;
  total_price: number | null;
  payment_status: string | null;
  payment_method: string | null;
  status: string;
  hotel_name: string | null;
}

interface HotelBalance {
  hotel_id: string;
  hotel_name: string;
  total_pending: number;
}

const ConciergeTransactions = () => {
  const { hotelIds, loading: contextLoading } = useUserContext();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [hotelBalance, setHotelBalance] = useState<HotelBalance | null>(null);
  
  // Filters
  const [dateFilter, setDateFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  const fetchData = async () => {
    if (hotelIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      // Fetch bookings for the concierge's hotels
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_id,
          booking_date,
          booking_time,
          room_number,
          client_first_name,
          client_last_name,
          hairdresser_name,
          total_price,
          payment_status,
          payment_method,
          status,
          hotel_name,
          hotel_id
        `)
        .in('hotel_id', hotelIds)
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: false })
        .limit(200);

      if (bookingsError) throw bookingsError;
      setTransactions(bookings || []);

      // Fetch hotel ledger balance for the concierge's hotels
      const { data: ledger, error: ledgerError } = await supabase
        .from('hotel_ledger')
        .select(`
          hotel_id,
          amount,
          status,
          hotels (name)
        `)
        .in('hotel_id', hotelIds)
        .eq('status', 'pending');

      if (ledgerError) throw ledgerError;

      // Calculate total pending balance
      const totalPending = (ledger || []).reduce((sum, entry) => sum + entry.amount, 0);
      
      // Get hotel name from first entry or from hotels table
      let hotelName = "Mon Hôtel";
      if (ledger && ledger.length > 0 && ledger[0].hotels) {
        hotelName = (ledger[0].hotels as any).name;
      } else if (hotelIds.length > 0) {
        const { data: hotel } = await supabase
          .from('hotels')
          .select('name')
          .eq('id', hotelIds[0])
          .maybeSingle();
        if (hotel) hotelName = hotel.name;
      }

      setHotelBalance({
        hotel_id: hotelIds[0],
        hotel_name: hotelName,
        total_pending: totalPending,
      });

    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!contextLoading) {
      fetchData();
    }
  }, [contextLoading, hotelIds]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleDownloadStatement = () => {
    // Generate CSV of transactions
    const headers = ["Date", "Heure", "N° Chambre", "Client", "Prestation", "Coiffeur", "Montant", "Statut Paiement"];
    const rows = filteredTransactions.map(t => [
      format(new Date(t.booking_date), "dd/MM/yyyy"),
      t.booking_time.slice(0, 5),
      t.room_number || "-",
      `${t.client_first_name} ${t.client_last_name}`,
      `Réservation #${t.booking_id}`,
      t.hairdresser_name || "-",
      t.total_price ? `${t.total_price.toFixed(2)}€` : "-",
      t.payment_status || "-"
    ]);

    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `releve_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    
    toast.success("Relevé téléchargé");
  };

  // Apply filters
  const filteredTransactions = transactions.filter(t => {
    if (dateFilter && !t.booking_date.includes(dateFilter)) return false;
    if (roomFilter && (!t.room_number || !t.room_number.toLowerCase().includes(roomFilter.toLowerCase()))) return false;
    return true;
  });

  if (loading || contextLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hotelIds.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-12">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Aucun hôtel assigné à votre compte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions & Solde</h1>
          <p className="text-muted-foreground">Historique des prestations et solde comptable</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {hotelBalance?.hotel_name || "Hôtel"}
          </CardDescription>
          <CardTitle className="text-lg">Solde à régler à OOM</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-3xl font-bold ${(hotelBalance?.total_pending || 0) >= 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {(hotelBalance?.total_pending || 0) >= 0 ? '' : '-'}{Math.abs(hotelBalance?.total_pending || 0).toFixed(2)}€
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {(hotelBalance?.total_pending || 0) >= 0 
                  ? "Montant dû à OOM" 
                  : "Crédit en votre faveur"
                }
              </p>
            </div>
            <Button variant="outline" onClick={handleDownloadStatement}>
              <Download className="w-4 h-4 mr-2" />
              Télécharger Relevé
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-[200px]">
          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            placeholder="Filtrer par date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="relative flex-1 sm:max-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="N° de chambre"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="pl-10"
          />
        </div>
        {(dateFilter || roomFilter) && (
          <Button 
            variant="ghost" 
            onClick={() => { setDateFilter(""); setRoomFilter(""); }}
            className="text-muted-foreground"
          >
            Effacer filtres
          </Button>
        )}
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Journal des prestations</CardTitle>
          <CardDescription>
            Historique de toutes les prestations de votre hôtel
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Euro className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Aucune prestation trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Heure</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Chambre</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Client</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Coiffeur</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">Montant</th>
                    <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-2">
                        <span className="text-sm">
                          {format(new Date(transaction.booking_date), "dd MMM yyyy", { locale: fr })}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-sm text-muted-foreground">
                          {transaction.booking_time.slice(0, 5)}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-sm font-medium">
                          {transaction.room_number || "-"}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-sm">
                          {transaction.client_first_name} {transaction.client_last_name}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-sm text-muted-foreground">
                          {transaction.hairdresser_name || "-"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="font-medium">
                          {transaction.total_price ? `${transaction.total_price.toFixed(2)}€` : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <StatusBadge 
                          status={transaction.payment_status || 'pending'} 
                          type="payment" 
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConciergeTransactions;
