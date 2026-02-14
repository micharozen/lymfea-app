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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Eye, Target, TrendingUp } from "lucide-react";

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#f59e0b",
  tablet: "#8b5cf6",
  desktop: "#3b82f6",
  unknown: "#6b7280",
};

const STEP_LABELS: Record<string, string> = {
  welcome: "Accueil",
  treatments: "Menu",
  schedule: "Date/Heure",
  guest_info: "Infos client",
  payment: "Paiement",
  booking_completed: "Conversion",
};

interface FunnelStep {
  step_name: string;
  step_order: number;
  unique_sessions: number;
  total_events: number;
}

interface AnalyticsSummary {
  total_sessions: number;
  total_page_views: number;
  total_conversions: number;
  conversion_rate: number;
  device_breakdown: Record<string, number>;
  daily_visitors: Array<{ date: string; visitors: number }>;
}

interface Hotel {
  id: string;
  name: string;
}

interface SessionsByHotel {
  hotel_id: string;
  hotel_name: string;
  session_count: number;
}

const HOTEL_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

export default function Analytics() {
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelStep[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [sessionsByHotel, setSessionsByHotel] = useState<SessionsByHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch hotels for filter
  useEffect(() => {
    const fetchHotels = async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name");
      if (!error) setHotels(data || []);
    };
    fetchHotels();
  }, []);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const startStr = format(startDate, "yyyy-MM-dd");
        const endStr = format(endDate, "yyyy-MM-dd");

        // Fetch funnel data
        const { data: funnel, error: funnelError } = await supabase.rpc(
          "get_client_funnel",
          {
            _hotel_id: selectedHotel,
            _start_date: startStr,
            _end_date: endStr,
          }
        );

        if (funnelError) throw funnelError;
        setFunnelData(funnel || []);

        // Fetch summary
        const { data: summaryData, error: summaryError } = await supabase.rpc(
          "get_hotel_analytics_summary",
          {
            _hotel_id: selectedHotel,
            _start_date: startStr,
            _end_date: endStr,
          }
        );

        if (summaryError) throw summaryError;
        setSummary(summaryData?.[0] || null);

        // Fetch sessions by hotel (only when "Tous les lieux" is selected)
        if (!selectedHotel) {
          const { data: sessionsByHotelData, error: sessionsByHotelError } =
            await supabase.rpc("get_sessions_by_hotel", {
              _start_date: startStr,
              _end_date: endStr,
            });

          if (sessionsByHotelError) throw sessionsByHotelError;
          setSessionsByHotel(sessionsByHotelData || []);
        } else {
          setSessionsByHotel([]);
        }
      } catch (error) {
        console.error("Error fetching analytics:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les données analytiques",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedHotel]);

  const handlePeriodChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Prepare funnel data for chart with French labels
  const chartFunnelData = funnelData.map((step) => ({
    ...step,
    label: STEP_LABELS[step.step_name] || step.step_name,
  }));

  // Prepare device breakdown for pie chart
  const deviceData = summary?.device_breakdown
    ? Object.entries(summary.device_breakdown).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: value as number,
        color: DEVICE_COLORS[name] || "#6b7280",
      }))
    : [];

  // Prepare daily visitors for line chart
  const dailyData = summary?.daily_visitors || [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              Analytics Client
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Suivi du parcours de réservation
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector onPeriodChange={handlePeriodChange} />
            <Select
              value={selectedHotel || "all"}
              onValueChange={(v) => setSelectedHotel(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[180px]">
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
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        ) : (
          <>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Sessions"
            value={summary?.total_sessions?.toString() || "0"}
            icon={Users}
          />
          <StatCard
            title="Pages vues"
            value={summary?.total_page_views?.toString() || "0"}
            icon={Eye}
          />
          <StatCard
            title="Conversions"
            value={summary?.total_conversions?.toString() || "0"}
            icon={Target}
          />
          <StatCard
            title="Taux de conversion"
            value={`${summary?.conversion_rate || 0}%`}
            icon={TrendingUp}
            trend={
              summary?.conversion_rate && summary.conversion_rate > 5
                ? { value: "Bon", isPositive: true }
                : undefined
            }
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funnel Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funnel de conversion</CardTitle>
            </CardHeader>
            <CardContent>
              {chartFunnelData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Aucune donnée disponible
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartFunnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `${value} sessions`,
                        "Visiteurs uniques",
                      ]}
                    />
                    <Bar dataKey="unique_sessions" fill="#3b82f6" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Device Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Répartition par appareil
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deviceData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Aucune donnée disponible
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={deviceData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {deviceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${value} sessions`,
                        "Sessions",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sessions par lieu - Only shown when "Tous les lieux" is selected */}
        {!selectedHotel && sessionsByHotel.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions par lieu</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, sessionsByHotel.length * 50)}>
                <BarChart data={sessionsByHotel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="hotel_name"
                    type="category"
                    width={150}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value} sessions`,
                      "Sessions uniques",
                    ]}
                  />
                  <Bar dataKey="session_count" radius={4}>
                    {sessionsByHotel.map((_, index) => (
                      <Cell
                        key={`hotel-cell-${index}`}
                        fill={HOTEL_COLORS[index % HOTEL_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Daily Visitors Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visiteurs par jour</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Aucune donnée disponible
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) =>
                      format(new Date(val), "dd MMM", { locale: fr })
                    }
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(val) =>
                      format(new Date(val), "dd MMMM yyyy", { locale: fr })
                    }
                    formatter={(value: number) => [
                      `${value} visiteurs`,
                      "Visiteurs",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="visitors"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </div>
  );
}
