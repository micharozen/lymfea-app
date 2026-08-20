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
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/lib/dateLocale";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/formatPrice";
import { StatusBadge } from "@/components/StatusBadge";
import { brand } from "@/config/brand";

interface BookingTransaction {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  room_number: string | null;
  client_first_name: string;
  client_last_name: string;
  therapist_name: string | null;
  total_price: number | null;
  payment_status: string | null;
  payment_method: string | null;
  status: string;
  hotel_name: string | null;
  hotels?: { currency: string | null } | null;
}

interface HotelBalance {
  hotel_id: string;
  hotel_name: string;
  total_pending: number;
}

const ConciergeTransactions = () => {
  const { t } = useTranslation(['admin', 'common']);
  const dateLocale = useDateLocale();
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
          therapist_name,
          total_price,
          payment_status,
          payment_method,
          status,
          hotel_name,
          hotel_id,
          hotels (currency)
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
      let hotelName = t('transactionsPage.myVenue');
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
      toast.error(t('transactionsPage.loadError'));
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
    const headers = [
      t('transactionsPage.csv.date'),
      t('transactionsPage.csv.time'),
      t('transactionsPage.csv.roomNumber'),
      t('transactionsPage.csv.client'),
      t('transactionsPage.csv.service'),
      t('transactionsPage.csv.therapist'),
      t('transactionsPage.csv.amount'),
      t('transactionsPage.csv.paymentStatus'),
    ];
    const rows = filteredTransactions.map(tx => [
      format(new Date(tx.booking_date), "dd/MM/yyyy"),
      tx.booking_time.slice(0, 5),
      tx.room_number || "-",
      `${tx.client_first_name} ${tx.client_last_name}`,
      t('transactionsPage.csv.bookingRef', { id: tx.booking_id }),
      tx.therapist_name || "-",
      tx.total_price ? formatPrice(tx.total_price, tx.hotels?.currency || 'EUR') : "-",
      tx.payment_status || "-"
    ]);

    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `releve_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    
    toast.success(t('transactionsPage.statementDownloaded'));
  };

  // Apply filters
  const filteredTransactions = transactions.filter(tx => {
    if (dateFilter && !tx.booking_date.includes(dateFilter)) return false;
    if (roomFilter && (!tx.room_number || !tx.room_number.toLowerCase().includes(roomFilter.toLowerCase()))) return false;
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
          <p className="text-muted-foreground">{t('transactionsPage.noVenueAssigned')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium text-foreground">{t('transactionsPage.title')}</h1>
          <p className="text-muted-foreground">{t('transactionsPage.subtitle')}</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {t('transactionsPage.refresh')}
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {hotelBalance?.hotel_name || t('transactionsPage.venueFallback')}
          </CardDescription>
          <CardTitle className="text-lg">{t('transactionsPage.balanceTitle', { brand: brand.name })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-3xl font-bold ${(hotelBalance?.total_pending || 0) >= 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {(hotelBalance?.total_pending || 0) >= 0 ? '' : '-'}{Math.abs(hotelBalance?.total_pending || 0).toFixed(2)}€
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {(hotelBalance?.total_pending || 0) >= 0 
                  ? t('transactionsPage.amountDue', { brand: brand.name })
                  : t('transactionsPage.creditInYourFavour')
                }
              </p>
            </div>
            <Button variant="outline" onClick={handleDownloadStatement}>
              Télécharger Relevé
              <Download className="w-4 h-4" />
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
            placeholder={t('transactionsPage.filterByDate')}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="relative flex-1 sm:max-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('transactionsPage.roomNumberFilter')}
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
            {t('transactionsPage.clearFilters')}
          </Button>
        )}
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('transactionsPage.journalTitle')}</CardTitle>
          <CardDescription>
            {t('transactionsPage.journalSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Euro className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>{t('transactionsPage.noService')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.date')}</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.time')}</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.room')}</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.client')}</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.therapist')}</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.amount')}</th>
                    <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground">{t('transactionsPage.table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-2">
                        <span className="text-sm">
                          {format(new Date(transaction.booking_date), "dd MMM yyyy", { locale: dateLocale })}
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
                          {transaction.therapist_name || "-"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="font-medium">
                          {transaction.total_price ? formatPrice(transaction.total_price, transaction.hotels?.currency || 'EUR') : "-"}
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
