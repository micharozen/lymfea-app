import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { BarChart3, Clock, Euro, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PwaHeader from "@/components/pwa/Header";
import WalletTabContent from "@/components/pwa/WalletTabContent";
import { formatPrice } from "@/lib/formatPrice";
import { useTherapistEarnings } from "@/hooks/pwa/useTherapistEarnings";

type Period = "today" | "thisWeek" | "thisMonth" | "lastMonth";

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  switch (period) {
    case "today":
      return {
        start: format(startOfDay(now), "yyyy-MM-dd"),
        end: format(endOfDay(now), "yyyy-MM-dd"),
      };
    case "thisWeek":
      return {
        start: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "thisMonth":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    case "lastMonth": {
      const lastMonth = subMonths(now, 1);
      return {
        start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
      };
    }
  }
}

type TabKey = "stats" | "wallet";

const PwaStatistics = () => {
  const { t, i18n } = useTranslation("pwa");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab: TabKey = (searchParams.get("tab") as TabKey) === "wallet" ? "wallet" : "stats";

  const [therapistId, setTherapistId] = useState<string>();
  const [period, setPeriod] = useState<Period>("thisMonth");
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { start, end } = useMemo(() => getDateRange(period), [period]);
  const { data: earnings, isLoading } = useTherapistEarnings(therapistId, start, end);

  useEffect(() => {
    const fetchTherapistId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/pwa/login");
        return;
      }
      const { data: therapist } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (therapist) {
        setTherapistId(therapist.id);
      }
    };
    fetchTherapistId();
  }, [navigate]);

  const chartData = useMemo(() => {
    if (!earnings?.dailyData) return [];
    return earnings.dailyData.map((d) => ({
      ...d,
      label: format(new Date(d.date + "T00:00:00"), "dd/MM"),
    }));
  }, [earnings?.dailyData]);

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: t("statistics.today") },
    { key: "thisWeek", label: t("statistics.thisWeek") },
    { key: "thisMonth", label: t("statistics.thisMonth") },
    { key: "lastMonth", label: t("statistics.lastMonth") },
  ];

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  };

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        centerSlot={
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">{t("statistics.title")}</h1>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Beta
            </span>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stats">{t("statistics.stats")}</TabsTrigger>
            <TabsTrigger value="wallet">{t("statistics.walletTab")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stats" className="flex-1 overflow-auto mt-0">
          <div className="px-4 pt-4 pb-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="px-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          ) : (
            <div className="px-4 pb-24 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Euro className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {t("statistics.totalEarned")}
                    </span>
                  </div>
                  <div className="text-xl font-bold">
                    {formatPrice(earnings?.totalEarned ?? 0, "EUR", { decimals: 0 })}
                  </div>
                </Card>

                <Card className="p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {t("statistics.bookingCount")}
                    </span>
                  </div>
                  <div className="text-xl font-bold">{earnings?.bookingCount ?? 0}</div>
                </Card>

                <Card className="p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {t("statistics.hoursWorked")}
                    </span>
                  </div>
                  <div className="text-xl font-bold">
                    {formatHours(earnings?.hoursWorked ?? 0)}
                  </div>
                </Card>

                <Card className="p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {t("statistics.averagePerBooking")}
                    </span>
                  </div>
                  <div className="text-xl font-bold">
                    {formatPrice(earnings?.averagePerBooking ?? 0, "EUR", { decimals: 0 })}
                  </div>
                </Card>
              </div>

              {chartData.length > 1 && (
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-3">
                    {t("statistics.dailyEarnings")}
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          formatPrice(value, "EUR"),
                          t("statistics.totalEarned"),
                        ]}
                        labelFormatter={(label) => label}
                      />
                      <Bar
                        dataKey="earnings"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3">
                  {t("statistics.completedBookings")}
                </h3>
                {!earnings?.bookings.length ? (
                  <Card className="p-6 text-center text-muted-foreground text-sm">
                    {t("statistics.noData")}
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {earnings.bookings.map((booking) => (
                      <Card key={booking.id} className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              {booking.client_first_name} {booking.client_last_name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(booking.booking_date + "T00:00:00"), "d MMM", {
                                locale: dateLocale,
                              })}{" "}
                              {booking.booking_time?.substring(0, 5)} — {booking.hotel_name}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className="text-sm font-bold text-primary">
                              {formatPrice(booking.therapistShare, "EUR")}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              / {formatPrice(booking.calculatedTotal, "EUR")}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="wallet" className="flex-1 overflow-auto mt-0 pb-24">
          <WalletTabContent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PwaStatistics;
