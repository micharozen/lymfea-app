import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PeriodSelector } from "@/components/PeriodSelector";
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
import { SalesChart, StatusDonut, WeekForecast, RoomOccupancyHeatmap } from "@/components/admin/dashboard/DashboardCharts";
import { DashboardRankings } from "@/components/admin/dashboard/DashboardRankings";
import { DashboardOverview } from "@/components/admin/dashboard/DashboardOverview";
import { DashboardKpiRow } from "@/components/admin/dashboard/DashboardKpiRow";
import { DashboardClientMix } from "@/components/admin/dashboard/DashboardClientMix";
import { DashboardTodayStats } from "@/components/admin/dashboard/DashboardTodayStats";
import { MonthlyOutlookChart } from "@/components/admin/dashboard/MonthlyOutlookChart";

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
      <div className="bo-refonte min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--ink-mute)" }}>Chargement...</p>
      </div>
    );
  }

  const { stats } = data;
  const isSingleVenue = selectedHotel !== "all";

  return (
    <div className="bo-refonte min-h-screen">
      <div className="pg-shell">
        {/* Header + Filters */}
        <div className="pg-head">
          <div>
            <h1 className="bo-page-title">Accueil</h1>
            <div className="period">
              Période : {format(startDate, "dd MMM yyyy", { locale: fr })} —{" "}
              {format(endDate, "dd MMM yyyy", { locale: fr })}
            </div>
          </div>
          <div className="bo-toolbar">
            <PeriodSelector onPeriodChange={handlePeriodChange} />
            <Select value={selectedHotel} onValueChange={setSelectedHotel}>
              <SelectTrigger className="w-[200px]">
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
        </div>

        <Tabs defaultValue="dashboard">
          {!isConcierge && (
            <TabsList className="mt-4">
              <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
              <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="dashboard" className="mt-0">
            <DashboardAlerts alerts={data.alerts} missingRoomNumber={stats.missingRoomNumber} />

            {/* KPI row — le CA et le panier moyen restent réservés aux admins */}
            <DashboardKpiRow
              totalSales={stats.totalSales}
              salesTrend={stats.salesTrend}
              averageBasket={stats.averageBasket}
              totalBookings={stats.totalBookings}
              bookingsTrend={stats.bookingsTrend}
              cancellationRate={stats.cancellationRate}
              cancelledCount={stats.cancelledBookings}
              showRevenue={!isConcierge}
            />

            {/* Mix clients + canal de réservation — admins only */}
            {!isConcierge && (
              <DashboardClientMix clientMix={data.clientMix} bookingChannel={data.bookingChannel} />
            )}

            <div className="duo">
              <SalesChart data={data.salesChartData} />
              <StatusDonut data={data.statusDistribution} />
            </div>

            {/* Monthly outlook — fenêtre fixe 6 mois passés / 3 futurs, indépendante
                du filtre de période (respecte le lieu). Admins only (affiche le CA). */}
            {!isConcierge && (
              <MonthlyOutlookChart data={data.monthlyOutlook} byVenue={data.monthlyOutlookByVenue} />
            )}

            <RoomOccupancyHeatmap data={data.roomOccupancyHeatmap} />

            <div className="trio">
              <WeekForecast data={data.weekForecast} />
              <DashboardTodayStats
                todayBookings={stats.todayBookings}
                todayConfirmed={stats.todayConfirmed}
                leadTime={data.leadTime}
                activeTherapists={data.activeTherapists}
              />
              <DashboardRankings
                topVenues={data.topVenues}
                topTherapists={data.topTherapists}
                topTreatments={data.topTreatments}
                isSingleVenue={isSingleVenue}
              />
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
