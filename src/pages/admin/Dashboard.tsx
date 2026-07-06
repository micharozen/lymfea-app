import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useUser } from "@/contexts/UserContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { useCurrentVenueId } from "@/hooks/useCurrentVenueId";
import { useAdminWelcome } from "@/hooks/useAdminWelcome";
import { WelcomeDialog } from "@/components/admin/WelcomeDialog";
import { DashboardAlerts } from "@/components/admin/dashboard/DashboardAlerts";
import { SalesChart, StatusDonut, WeekForecast, RoomOccupancyHeatmap, BookingLeadTime } from "@/components/admin/dashboard/DashboardCharts";
import { DashboardRankings } from "@/components/admin/dashboard/DashboardRankings";
import { DashboardOverview } from "@/components/admin/dashboard/DashboardOverview";
import { DashboardKpiRow } from "@/components/admin/dashboard/DashboardKpiRow";
import { Ban, BedDouble, CalendarCheck, CalendarDays } from "lucide-react";

export default function Dashboard() {
  const { hotelIds } = useUser();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const currentVenueId = useCurrentVenueId();
  const welcome = useAdminWelcome();
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedHotel, setSelectedHotel] = useState<string>("all");

  // For concierges, scope the dashboard to their assigned hotel(s) — no "Tous les lieux".
  useEffect(() => {
    if (isConcierge && hotelIds.length > 0 && (selectedHotel === "all" || !hotelIds.includes(selectedHotel))) {
      setSelectedHotel(hotelIds[0]);
    }
  }, [isConcierge, hotelIds, selectedHotel]);

  // In venue_manager view (admin impersonating a venue), scope to that venue.
  useEffect(() => {
    if (currentVenueId && selectedHotel !== currentVenueId) {
      setSelectedHotel(currentVenueId);
    }
  }, [currentVenueId, selectedHotel]);

  const data = useDashboardData(startDate, endDate, selectedHotel);

  const visibleHotels = useMemo(() => {
    if (currentVenueId) return data.hotels.filter((h) => h.id === currentVenueId);
    if (isConcierge) return data.hotels.filter((h) => hotelIds.includes(h.id));
    return data.hotels;
  }, [data.hotels, isConcierge, hotelIds, currentVenueId]);

  const handlePeriodChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  if (data.loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  const { stats } = data;
  const isSingleVenue = selectedHotel !== "all";

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header + Filters */}
        <div className="mb-6">
          <h1 className="text-lg font-medium text-foreground mb-4 md:mb-6">Accueil</h1>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <PeriodSelector onPeriodChange={handlePeriodChange} />
            <Select value={selectedHotel} onValueChange={setSelectedHotel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={isConcierge ? "Sélectionner un lieu" : "Tous les lieux"} />
              </SelectTrigger>
              <SelectContent>
                {!isConcierge && <SelectItem value="all">Tous les lieux</SelectItem>}
                {visibleHotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Période : {format(startDate, "dd MMM yyyy", { locale: fr })} -{" "}
            {format(endDate, "dd MMM yyyy", { locale: fr })}
          </p>
        </div>

        <Tabs defaultValue="dashboard">
          {!isConcierge && (
            <TabsList className="mb-4">
              <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
              <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="dashboard" className="mt-0">
            {/* Alerts */}
            <DashboardAlerts alerts={data.alerts} />

        {/* KPI row — admins only (CA / Panier moyen / Vente Retail) */}
        {!isConcierge && (
          <DashboardKpiRow
            totalSales={stats.totalSales}
            salesTrend={stats.salesTrend}
            averageBasket={stats.averageBasket}
          />
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <StatCard
            title="Réservations"
            value={stats.totalBookings}
            icon={CalendarCheck}
            alignRight
            trend={
              stats.bookingsTrend !== 0
                ? {
                    value: `${Math.abs(stats.bookingsTrend)}%`,
                    isPositive: stats.bookingsTrend > 0,
                    periodLabel: "vs période précédente",
                  }
                : undefined
            }
          />
          <StatCard title="Aujourd'hui" value={stats.todayBookings} icon={CalendarDays} alignRight />
          <StatCard title="Taux annulation" value={`${stats.cancellationRate}%`} icon={Ban} alignRight />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          <div className="lg:col-span-3">
            <SalesChart data={data.salesChartData} />
          </div>
          <div className="lg:col-span-2">
            <StatusDonut data={data.statusDistribution} />
          </div>
        </div>

        {/* Room occupancy heatmap (per room) */}
        <div className="mb-6">
          <RoomOccupancyHeatmap data={data.roomOccupancyHeatmap} />
        </div>

        {/* Week forecast + booking lead time */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          <div className="lg:col-span-3">
            <WeekForecast data={data.weekForecast} />
          </div>
          <div className="lg:col-span-2">
            <BookingLeadTime data={data.leadTime} />
          </div>
        </div>

        {stats.missingRoomNumber > 0 && (
          <div className="mb-6 max-w-sm">
            <StatCard title="Chambres à renseigner" value={stats.missingRoomNumber} icon={BedDouble} />
          </div>
        )}

            {/* Rankings */}
            <DashboardRankings
              topVenues={data.topVenues}
              topTherapists={data.topTherapists}
              topTreatments={data.topTreatments}
              isSingleVenue={isSingleVenue}
            />

            {/* Operational gauges */}
            <div className="mt-6 max-w-md">
              <Card className="relative border border-border bg-card shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground tracking-wide">
                      Thérapeutes actifs aujourd'hui
                    </p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  </div>
                  <div className="pointer-events-none select-none opacity-40 blur-[2px]">
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-2xl font-medium text-foreground tabular-nums">
                        {data.activeTherapists.used}/{data.activeTherapists.total}
                      </span>
                      <span className="text-sm text-muted-foreground">disponibles</span>
                    </div>
                    <Progress
                      value={
                        data.activeTherapists.total > 0
                          ? (data.activeTherapists.used / data.activeTherapists.total) * 100
                          : 0
                      }
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Overview tab — admins only (comparative view across all venues) */}
          {!isConcierge && (
            <TabsContent value="overview" className="mt-0">
              <DashboardOverview hotelData={data.hotelData} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <WelcomeDialog open={welcome.shouldShow} onClose={welcome.dismiss} />
    </div>
  );
}
