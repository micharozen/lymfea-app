import { useState, useEffect } from "react";
import { StatCard } from "@/components/StatCard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { format, differenceInDays, addDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/formatPrice";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertToEUR } from "@/lib/currencyConversion";

export default function Dashboard() {
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { rates } = useExchangeRates();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch bookings (only needed fields)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('booking_date, booking_time, total_price, hotel_id, status')
        .order('booking_date', { ascending: true });

      if (bookingsError) throw bookingsError;

      // Fetch hotels (only needed fields)
      const { data: hotelsData, error: hotelsError } = await supabase
        .from('hotels')
        .select('id, name, currency')
        .order('created_at', { ascending: false });

      if (hotelsError) throw hotelsError;

      setBookings(bookingsData || []);
      setHotels(hotelsData || []);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Filtrer les réservations par période
  const filteredBookings = bookings.filter(booking => {
    const bookingDate = parseISO(booking.booking_date);
    return isWithinInterval(bookingDate, { start: startDate, end: endDate });
  });

  // Map hotel_id -> currency pour la conversion
  const hotelCurrencyMap: Record<string, string> = {};
  hotels.forEach(hotel => {
    hotelCurrencyMap[hotel.id] = hotel.currency || 'EUR';
  });

  // Générer des données de ventes basées sur les vraies réservations
  const generateSalesData = () => {
    const days = differenceInDays(endDate, startDate);
    
    if (filteredBookings.length === 0) {
      return [];
    }

    // Pour "Aujourd'hui", générer des points horaires
    if (days === 0) {
      return Array.from({ length: 8 }, (_, i) => {
        const hour = 9 + i * 2;
        const hourBookings = filteredBookings.filter(b => {
          const bookingHour = parseInt(b.booking_time?.split(':')[0] || '0');
          return bookingHour >= hour && bookingHour < hour + 2;
        });
        const sales = hourBookings.reduce((sum, b) => {
          const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
          return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
        }, 0);
        return {
          date: `${hour}h`,
          sales: sales,
        };
      });
    }
    
    // Grouper les ventes par date
    const salesByDate: { [key: string]: number } = {};
    
    // Initialiser toutes les dates de la période avec 0
    for (let i = 0; i <= days; i++) {
      const date = addDays(startDate, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      salesByDate[dateKey] = 0;
    }
    
    // Ajouter les ventes réelles (converties en EUR)
    filteredBookings.forEach(b => {
      const dateKey = b.booking_date;
      if (salesByDate.hasOwnProperty(dateKey)) {
        const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
        salesByDate[dateKey] += convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
      }
    });
    
    // Convertir en tableau et limiter à 15 points max pour la lisibilité
    const allDates = Object.entries(salesByDate).sort((a, b) => a[0].localeCompare(b[0]));
    const maxPoints = 15;
    
    if (allDates.length <= maxPoints) {
      return allDates.map(([dateStr, sales]) => ({
        date: format(parseISO(dateStr), "dd MMM", { locale: fr }),
        sales: sales,
      }));
    }
    
    // Si plus de 15 jours, échantillonner
    const interval = Math.ceil(allDates.length / maxPoints);
    return allDates
      .filter((_, index) => index % interval === 0 || index === allDates.length - 1)
      .map(([dateStr, sales]) => ({
        date: format(parseISO(dateStr), "dd MMM", { locale: fr }),
        sales: sales,
      }));
  };

  // Calculer les statistiques basées sur les vraies données (en EUR)
  const calculateStats = () => {
    const totalSales = filteredBookings.reduce((sum, b) => {
      const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
      return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
    }, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingBookings = filteredBookings.filter(b => {
      const bookingDate = parseISO(b.booking_date);
      // Réservations à venir : date future et statut confirmé ou en attente
      return bookingDate >= today && ['Confirmé', 'En attente', 'Assigné'].includes(b.status);
    }).length;
    const totalBookings = filteredBookings.length;
    const completedBookings = filteredBookings.filter(b => b.status === 'Terminé').length;
    
    return {
      totalSales: totalSales.toFixed(2),
      upcomingBookings: upcomingBookings,
      totalBookings: totalBookings,
      totalSessions: completedBookings,
      salesTrend: "0",
      bookingsTrend: "0",
      sessionsTrend: "0",
    };
  };

  const salesData = generateSalesData();
  const stats = calculateStats();

  const hotelData = hotels.map(hotel => {
    const hotelBookings = filteredBookings.filter(b => b.hotel_id === hotel.id);
    const totalSales = hotelBookings.reduce((sum, b) => {
      const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
      return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
    }, 0);
    const totalCancelled = hotelBookings.filter(b => b.status === 'Annulé').length;
    const totalSessions = hotelBookings.filter(b => b.status === 'Terminé').length;
    
    return {
      name: hotel.name,
      totalSales: formatPrice(totalSales),
      totalBookings: hotelBookings.length,
      totalSessions: totalSessions,
      totalCancelled: totalCancelled,
    };
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground mb-4 md:mb-8 flex items-center gap-2">
            🏠 Accueil
          </h1>
          <div className="flex items-center justify-between mb-2">
            <PeriodSelector onPeriodChange={handlePeriodChange} />
          </div>
          <p className="text-sm text-muted-foreground">
            Période : {format(startDate, "dd MMM yyyy", { locale: fr })} - {format(endDate, "dd MMM yyyy", { locale: fr })}
          </p>
        </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard
          title="Ventes totales"
          value={stats.totalSales === "0.00" ? "0 €" : `${stats.totalSales} €`}
          trend={parseFloat(stats.salesTrend) !== 0 ? { value: `${Math.abs(parseFloat(stats.salesTrend))}%`, isPositive: parseFloat(stats.salesTrend) > 0 } : undefined}
        />
        <StatCard
          title="Réservations à venir"
          value={stats.upcomingBookings}
        />
        <StatCard
          title="Réservations totales"
          value={stats.totalBookings}
          trend={parseFloat(stats.bookingsTrend) !== 0 ? { value: `${Math.abs(parseFloat(stats.bookingsTrend))}%`, isPositive: parseFloat(stats.bookingsTrend) > 0 } : undefined}
        />
      </div>

      {salesData.length > 0 ? (
        <Card className="mb-6 border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-foreground">Ventes totales</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  stroke="#666"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#666"
                  tickFormatter={(value) => `${value} €`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, 'Ventes']}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#000000"
                  strokeWidth={2}
                  dot={{ fill: '#000000', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#000000' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border border-border bg-card shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Aucune donnée de vente pour cette période</p>
          </CardContent>
        </Card>
      )}

      <Card className="border border-border bg-card shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold text-foreground">Vue d&apos;ensemble</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {hotelData.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3">Nom de l&apos;hôtel</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">Ventes totales</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">Réservations</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">Sessions</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">Annulations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hotelData.map((hotel, index) => (
                    <TableRow 
                      key={index} 
                      className="border-b border-border/30 last:border-0"
                    >
                      <TableCell className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-sm shrink-0">
                            🏨
                          </div>
                          <span className="font-semibold text-base text-foreground">{hotel.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums">{hotel.totalSales}</TableCell>
                      <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">{hotel.totalBookings}</TableCell>
                      <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">{hotel.totalSessions}</TableCell>
                      <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">{hotel.totalCancelled}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center px-6">
              <p className="text-muted-foreground">Aucun hôtel trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
