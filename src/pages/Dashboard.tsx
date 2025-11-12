import { useState } from "react";
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { format, differenceInDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";

export default function Dashboard() {
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const handlePeriodChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Générer des données de ventes basées sur la période
  const generateSalesData = () => {
    const days = differenceInDays(endDate, startDate);
    const dataPoints = Math.min(days, 10); // Maximum 10 points sur le graphique
    const interval = Math.max(1, Math.floor(days / dataPoints));
    
    return Array.from({ length: dataPoints }, (_, i) => {
      const date = addDays(startDate, i * interval);
      const randomSales = Math.floor(Math.random() * 500) + 100;
      return {
        date: format(date, "dd MMM", { locale: fr }),
        sales: randomSales,
      };
    });
  };

  // Calculer les statistiques basées sur la période
  const calculateStats = () => {
    const days = differenceInDays(endDate, startDate);
    const baseMultiplier = days / 30; // Normaliser par rapport à 30 jours
    
    return {
      totalSales: (Math.random() * 5000 * baseMultiplier).toFixed(2),
      upcomingBookings: Math.floor(Math.random() * 50 * baseMultiplier),
      totalBookings: Math.floor(Math.random() * 100 * baseMultiplier),
      totalSessions: Math.floor(Math.random() * 150 * baseMultiplier),
      salesTrend: ((Math.random() - 0.5) * 20).toFixed(1),
      bookingsTrend: ((Math.random() - 0.5) * 20).toFixed(1),
      sessionsTrend: ((Math.random() - 0.5) * 20).toFixed(1),
    };
  };

  const salesData = generateSalesData();
  const stats = calculateStats();

  const hotelData = [
    {
      name: "Hôtel Sofitel Paris le Faubourg",
      totalSales: `${stats.totalSales} €`,
      totalBookings: stats.totalBookings,
      totalSessions: stats.totalSessions,
      totalCancelled: Math.floor(stats.totalBookings * 0.1),
    },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <h1 className="text-3xl font-bold text-foreground">Accueil</h1>
          </div>
          <PeriodSelector onPeriodChange={handlePeriodChange} />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Période : {format(startDate, "dd MMM yyyy", { locale: fr })} - {format(endDate, "dd MMM yyyy", { locale: fr })}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Ventes totales"
          value={`${stats.totalSales} €`}
          trend={{ value: `${Math.abs(parseFloat(stats.salesTrend))}%`, isPositive: parseFloat(stats.salesTrend) > 0 }}
        />
        <StatCard
          title="Réservations à venir"
          value={stats.upcomingBookings}
        />
        <StatCard
          title="Réservations totales"
          value={stats.totalBookings}
          trend={{ value: `${Math.abs(parseFloat(stats.bookingsTrend))}%`, isPositive: parseFloat(stats.bookingsTrend) > 0 }}
        />
        <StatCard
          title="Sessions totales"
          value={stats.totalSessions}
          trend={{ value: `${Math.abs(parseFloat(stats.sessionsTrend))}%`, isPositive: parseFloat(stats.sessionsTrend) > 0 }}
        />
      </div>

      <Card className="mb-6 border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Ventes totales</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
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
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Vue d'ensemble</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground font-normal">Nom de l'hôtel</TableHead>
                <TableHead className="text-muted-foreground font-normal">Ventes totales</TableHead>
                <TableHead className="text-muted-foreground font-normal">Réservations totales</TableHead>
                <TableHead className="text-muted-foreground font-normal">Sessions totales</TableHead>
                <TableHead className="text-muted-foreground font-normal">Annulations totales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotelData.map((hotel, index) => (
                <TableRow key={index}>
                  <TableCell className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-xs">
                      🏨
                    </div>
                    <span className="font-medium">{hotel.name}</span>
                  </TableCell>
                  <TableCell>{hotel.totalSales}</TableCell>
                  <TableCell>{hotel.totalBookings}</TableCell>
                  <TableCell>{hotel.totalSessions}</TableCell>
                  <TableCell>{hotel.totalCancelled}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
