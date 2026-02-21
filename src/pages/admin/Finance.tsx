import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Euro,
  Users,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { brand } from "@/config/brand";

interface LedgerEntry {
  id: string;
  hotel_id: string;
  booking_id: string | null;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  hotels?: {
    name: string;
    image: string | null;
  } | null;
  bookings?: {
    booking_id: number;
    client_first_name: string;
    client_last_name: string;
  } | null;
}

interface PayoutEntry {
  id: string;
  therapist_id: string;
  booking_id: string;
  amount: number;
  stripe_transfer_id: string | null;
  status: string;
  created_at: string;
  therapists?: {
    first_name: string;
    last_name: string;
    profile_image: string | null;
  } | null;
  bookings?: {
    booking_id: number;
    hotel_name: string | null;
  } | null;
}

interface HotelNetting {
  hotel_id: string;
  hotel_name: string;
  hotel_image: string | null;
  total_pending: number;
  entries_count: number;
}

interface FinanceSummary {
  totalReceivables: number; // Positive ledger entries (hotels owe Lymfea)
  totalPayouts: number; // Money paid to therapists
  netProfit: number; // Receivables - Payouts
  pendingPayouts: number;
}

const Finance = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [payoutEntries, setPayoutEntries] = useState<PayoutEntry[]>([]);
  const [hotelNetting, setHotelNetting] = useState<HotelNetting[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({
    totalReceivables: 0,
    totalPayouts: 0,
    netProfit: 0,
    pendingPayouts: 0,
  });

  const fetchFinanceData = async () => {
    try {
      // Fetch ledger entries with hotel info
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('hotel_ledger')
        .select(`
          *,
          hotels (name, image),
          bookings (booking_id, client_first_name, client_last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (ledgerError) throw ledgerError;
      setLedgerEntries(ledgerData || []);

      // Fetch payout entries with therapist info
      const { data: payoutData, error: payoutError } = await supabase
        .from('therapist_payouts')
        .select(`
          *,
          therapists (first_name, last_name, profile_image),
          bookings (booking_id, hotel_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (payoutError) throw payoutError;
      setPayoutEntries(payoutData || []);

      // Calculate hotel netting (group by hotel)
      const nettingMap = new Map<string, HotelNetting>();
      (ledgerData || [])
        .filter(entry => entry.status === 'pending')
        .forEach(entry => {
          const existing = nettingMap.get(entry.hotel_id);
          if (existing) {
            existing.total_pending += entry.amount;
            existing.entries_count += 1;
          } else {
            nettingMap.set(entry.hotel_id, {
              hotel_id: entry.hotel_id,
              hotel_name: entry.hotels?.name || 'Hôtel inconnu',
              hotel_image: entry.hotels?.image || null,
              total_pending: entry.amount,
              entries_count: 1,
            });
          }
        });
      setHotelNetting(Array.from(nettingMap.values()));

      // Calculate summary
      const totalReceivables = (ledgerData || [])
        .filter(e => e.status === 'pending' && e.amount > 0)
        .reduce((sum, e) => sum + e.amount, 0);

      const totalOwedToHotels = (ledgerData || [])
        .filter(e => e.status === 'pending' && e.amount < 0)
        .reduce((sum, e) => sum + Math.abs(e.amount), 0);

      const totalPayouts = (payoutData || [])
        .filter(e => e.status === 'completed')
        .reduce((sum, e) => sum + e.amount, 0);

      const pendingPayouts = (payoutData || [])
        .filter(e => e.status === 'pending' || e.status === 'processing')
        .reduce((sum, e) => sum + e.amount, 0);

      setSummary({
        totalReceivables: totalReceivables - totalOwedToHotels,
        totalPayouts,
        netProfit: totalReceivables - totalOwedToHotels - totalPayouts,
        pendingPayouts,
      });

    } catch (error) {
      console.error('Error fetching finance data:', error);
      toast.error("Erreur lors du chargement des données financières");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();

    // Real-time subscriptions
    const ledgerChannel = supabase
      .channel('ledger-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_ledger' }, fetchFinanceData)
      .subscribe();

    const payoutChannel = supabase
      .channel('payout-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'therapist_payouts' }, fetchFinanceData)
      .subscribe();

    return () => {
      supabase.removeChannel(ledgerChannel);
      supabase.removeChannel(payoutChannel);
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFinanceData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">En attente</Badge>;
      case 'billed':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Facturé</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Payé</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Complété</Badge>;
      case 'failed':
        return <Badge variant="destructive">Échoué</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">En cours</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">💰 Finance</h1>
          <p className="text-muted-foreground">Suivi des revenus, netting hôtels et paiements thérapeutes</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Receivables */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Créances Hôtels (Net)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${summary.totalReceivables >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.totalReceivables >= 0 ? '+' : ''}{summary.totalReceivables.toFixed(2)}€
              </span>
              {summary.totalReceivables >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-green-600" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-600" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalReceivables >= 0 ? 'À recevoir des hôtels' : 'À payer aux hôtels'}
            </p>
          </CardContent>
        </Card>

        {/* Payouts Sent */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Avances Thérapeutes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-orange-600">
                -{summary.totalPayouts.toFixed(2)}€
              </span>
              <ArrowDownRight className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cash advances versées
            </p>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-primary">
              <Wallet className="w-4 h-4" />
              {`Profit Net ${brand.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.netProfit >= 0 ? '+' : ''}{summary.netProfit.toFixed(2)}€
              </span>
              {summary.netProfit >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Créances - Avances
            </p>
          </CardContent>
        </Card>

        {/* Pending Payouts */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Payouts en attente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-yellow-600">
                {summary.pendingPayouts.toFixed(2)}€
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Transferts non complétés
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="netting" className="space-y-4">
        <TabsList>
          <TabsTrigger value="netting">🏨 Netting Hôtels</TabsTrigger>
          <TabsTrigger value="ledger">📒 Grand Livre</TabsTrigger>
          <TabsTrigger value="payouts">💆 Payouts Thérapeutes</TabsTrigger>
        </TabsList>

        {/* Netting Tab */}
        <TabsContent value="netting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Soldes par Hôtel</CardTitle>
              <CardDescription>
                {`Montants en attente de règlement avec chaque hôtel (positif = l'hôtel doit à ${brand.name})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hotelNetting.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>Aucune entrée en attente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hotelNetting
                    .sort((a, b) => Math.abs(b.total_pending) - Math.abs(a.total_pending))
                    .map((hotel) => (
                      <div 
                        key={hotel.hotel_id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-background overflow-hidden">
                            {hotel.hotel_image ? (
                              <img src={hotel.hotel_image} alt={hotel.hotel_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{hotel.hotel_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {hotel.entries_count} transaction{hotel.entries_count > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${hotel.total_pending >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {hotel.total_pending >= 0 ? '+' : ''}{hotel.total_pending.toFixed(2)}€
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hotel.total_pending >= 0 ? 'À recevoir' : 'À payer'}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ledger Tab */}
        <TabsContent value="ledger" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Grand Livre</CardTitle>
              <CardDescription>
                Historique de toutes les transactions hôtels
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ledgerEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Euro className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>Aucune entrée dans le ledger</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Hôtel</th>
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Description</th>
                        <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">Montant</th>
                        <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 h-12">
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-sm">
                              {format(new Date(entry.created_at), "dd MMM yyyy", { locale: fr })}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {format(new Date(entry.created_at), "HH:mm")}
                            </span>
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-sm font-medium">{entry.hotels?.name || 'N/A'}</span>
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-sm text-muted-foreground">{entry.description || '-'}</span>
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <span className={`font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(2)}€
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            {getStatusBadge(entry.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Payouts</CardTitle>
              <CardDescription>
                Transferts vers les comptes Stripe des thérapeutes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payoutEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>Aucun payout enregistré</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Thérapeute</th>
                        <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Réservation</th>
                        <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">Montant</th>
                        <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 h-12">
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-sm">
                              {format(new Date(entry.created_at), "dd MMM yyyy", { locale: fr })}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {format(new Date(entry.created_at), "HH:mm")}
                            </span>
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                                {entry.therapists?.profile_image ? (
                                  <img src={entry.therapists.profile_image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs font-medium">
                                    {entry.therapists?.first_name?.[0]}{entry.therapists?.last_name?.[0]}
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-medium">
                                {entry.therapists?.first_name} {entry.therapists?.last_name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-sm">#{entry.bookings?.booking_id}</span>
                            <span className="text-xs text-muted-foreground ml-2">{entry.bookings?.hotel_name}</span>
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <span className="font-medium text-green-600">
                              {entry.amount.toFixed(2)}€
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            {getStatusBadge(entry.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Finance;
