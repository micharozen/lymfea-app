import { useState, useEffect } from "react";
import { StatCard } from "@/components/StatCard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { format, differenceInDays, addDays, subDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/formatPrice";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertToEUR } from "@/lib/currencyConversion";
import PwaHeader from "@/components/pwa/Header";

export default function AdminPwaAccueil() {
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHotel, setSelectedHotel] = useState<string>("all");
  const { toast } = useToast();
  const { rates } = useExchangeRates();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('booking_date, booking_time, total_price, hotel_id, status')
        .order('booking_date', { ascending: true });

      if (bookingsError) throw bookingsError;

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

  const filteredBookings = bookings.filter(booking => {
    const bookingDate = parseISO(booking.booking_date);
    const matchesDate = isWithinInterval(bookingDate, { start: startDate, end: endDate });
    const matchesHotel = selectedHotel === "all" || booking.hotel_id === selectedHotel;
    return matchesDate && matchesHotel;
  });

  const hotelCurrencyMap: Record<string, string> = {};
  hotels.forEach(hotel => {
    hotelCurrencyMap[hotel.id] = hotel.currency || 'EUR';
  });

  const getPreviousPeriodBookings = () => {
    const daysDiff = differenceInDays(endDate, startDate);
    const prevEnd = subDays(startDate, 1);
    const prevStart = subDays(startDate, daysDiff + 1);

    return bookings.filter(booking => {
      const bookingDate = parseISO(booking.booking_date);
      const matchesDate = isWithinInterval(bookingDate, { start: prevStart, end: prevEnd });
      const matchesHotel = selectedHotel === "all" || booking.hotel_id === selectedHotel;
      return matchesDate && matchesHotel;
    });
  };

  const generateSalesData = () => {
    const days = differenceInDays(endDate, startDate);

    if (filteredBookings.length === 0) return [];

    if (days === 0) {
      return Array.from({ length: 8 }, (_, i) => {
        const hour = 9 + i * 2;
        const hourBookings = filteredBookings.filter(b => {
          const bookingHour = parseInt(b.booking_time?.split(':')[0] || '0');
          return bookingHour >= hour && bookingHour < hour + 2;
        });
        const sales = hourBookings.reduce((sum: number, b: any) => {
          const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
          return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
        }, 0);
        return { date: `${hour}h`, sales };
      });
    }

    const salesByDate: { [key: string]: number } = {};
    for (let i = 0; i <= days; i++) {
      const date = addDays(startDate, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      salesByDate[dateKey] = 0;
    }

    filteredBookings.forEach(b => {
      const dateKey = b.booking_date;
      if (salesByDate.hasOwnProperty(dateKey)) {
        const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
        salesByDate[dateKey] += convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
      }
    });

    const allDates = Object.entries(salesByDate).sort((a, b) => a[0].localeCompare(b[0]));
    const maxPoints = 10;

    if (allDates.length <= maxPoints) {
      return allDates.map(([dateStr, sales]) => ({
        date: format(parseISO(dateStr), "dd/MM", { locale: fr }),
        sales,
      }));
    }

    const interval = Math.ceil(allDates.length / maxPoints);
    return allDates
      .filter((_, index) => index % interval === 0 || index === allDates.length - 1)
      .map(([dateStr, sales]) => ({
        date: format(parseISO(dateStr), "dd/MM", { locale: fr }),
        sales,
      }));
  };

  const calculateStats = () => {
    const totalSales = filteredBookings.reduce((sum, b) => {
      const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
      return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
    }, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingBookings = filteredBookings.filter(b => {
      const bookingDate = parseISO(b.booking_date);
      return bookingDate >= today && ['Confirmé', 'En attente', 'Assigné'].includes(b.status);
    }).length;
    const totalBookings = filteredBookings.length;

    const prevBookings = getPreviousPeriodBookings();
    const prevTotalSales = prevBookings.reduce((sum, b) => {
      const currency = hotelCurrencyMap[b.hotel_id] || 'EUR';
      return sum + convertToEUR(parseFloat(b.total_price) || 0, currency, rates);
    }, 0);
    const prevTotalBookings = prevBookings.length;

    const salesTrend = prevTotalSales > 0
      ? Math.round(((totalSales - prevTotalSales) / prevTotalSales) * 100)
      : 0;
    const bookingsTrend = prevTotalBookings > 0
      ? Math.round(((totalBookings - prevTotalBookings) / prevTotalBookings) * 100)
      : 0;

    return {
      totalSales: totalSales.toFixed(2),
      upcomingBookings,
      totalBookings,
      salesTrend,
      bookingsTrend,
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
      totalSessions,
      totalCancelled,
    };
  });

  if (loading) {
    return (
      <div className="flex flex-1 flex-col bg-muted/30">
        <PwaHeader title="Accueil" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <PwaHeader title="Accueil" />

      <div className="p-4 space-y-4">
        {/* Filtres */}
        <div className="space-y-2">
          <PeriodSelector onPeriodChange={handlePeriodChange} />
          <Select value={selectedHotel} onValueChange={setSelectedHotel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tous les lieux" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les lieux</SelectItem>
              {hotels.map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Période : {format(startDate, "dd MMM yyyy", { locale: fr })} - {format(endDate, "dd MMM yyyy", { locale: fr })}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-3">
          <StatCard
            title="Ventes totales"
            value={stats.totalSales === "0.00" ? "0 €" : `${stats.totalSales} €`}
            trend={stats.salesTrend !== 0 ? { value: `${Math.abs(stats.salesTrend)}%`, isPositive: stats.salesTrend > 0, periodLabel: "vs période précédente" } : undefined}
          />
          <StatCard
            title="Réservations à venir"
            value={stats.upcomingBookings}
          />
          <StatCard
            title="Réservations totales"
            value={stats.totalBookings}
            trend={stats.bookingsTrend !== 0 ? { value: `${Math.abs(stats.bookingsTrend)}%`, isPositive: stats.bookingsTrend > 0, periodLabel: "vs période précédente" } : undefined}
          />
        </div>

        {/* Chart */}
        {salesData.length > 0 ? (
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-foreground">Ventes totales</CardTitle>
            </CardHeader>
            <CardContent className="pl-0 pr-2">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="#666"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="#666"
                    tickFormatter={(value) => `${value}€`}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)} €`, 'Ventes']}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="#000000"
                    strokeWidth={2}
                    dot={{ fill: '#000000', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#000000' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Aucune donnée de vente pour cette période</p>
            </CardContent>
          </Card>
        )}

        {/* Hotel Overview - Mobile cards */}
        {hotelData.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-bold text-foreground">Vue d'ensemble</h2>
            {hotelData.map((hotel, index) => (
              <Card key={index} className="border border-border bg-card shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center text-sm shrink-0">
                      🏨
                    </div>
                    <span className="font-semibold text-sm text-foreground">{hotel.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Ventes</p>
                      <p className="font-medium tabular-nums">{hotel.totalSales}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Réservations</p>
                      <p className="font-medium tabular-nums">{hotel.totalBookings}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Sessions</p>
                      <p className="font-medium tabular-nums">{hotel.totalSessions}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Annulations</p>
                      <p className="font-medium tabular-nums">{hotel.totalCancelled}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
