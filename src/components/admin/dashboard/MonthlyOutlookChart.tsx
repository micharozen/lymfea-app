import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MonthlyOutlookPoint } from "@/hooks/useDashboardData";

type OutlookMetric = "revenue" | "bookings" | "avgBasket";

const CONFIRMED_COLOR = "hsl(18, 55%, 52%)";
const PENDING_COLOR = "#f59e0b";
// Mois courant + futurs = carnet de commandes, atténués vs le réalisé.
const BACKLOG_OPACITY = 0.55;

interface OutlookChartRow extends MonthlyOutlookPoint {
  label: string;
  confirmed: number;
  pending: number;
}

interface MonthlyOutlookChartProps {
  data: MonthlyOutlookPoint[];
}

function formatCompactEuro(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k €` : `${Math.round(value)} €`;
}

function OutlookTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: OutlookChartRow }>;
}) {
  const { t } = useTranslation("admin");
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        padding: "8px 12px",
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <p className="text-sm font-bold capitalize">{point.label}</p>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {point.isCurrent || point.isFuture
            ? t("dashboard.monthlyOutlook.backlog")
            : t("dashboard.monthlyOutlook.realized")}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        <p className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CONFIRMED_COLOR }} />
          {t("dashboard.monthlyOutlook.confirmed")} : {point.confirmedRevenue.toFixed(2)} € ·{" "}
          {t("dashboard.monthlyOutlook.bookingsCount", { count: point.confirmedCount })}
        </p>
        <p className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PENDING_COLOR }} />
          {t("dashboard.monthlyOutlook.pending")} : {point.pendingRevenue.toFixed(2)} € ·{" "}
          {t("dashboard.monthlyOutlook.bookingsCount", { count: point.pendingCount })}
        </p>
        <p className="pt-1 font-medium text-foreground">
          {point.totalRevenue.toFixed(2)} € · {t("dashboard.monthlyOutlook.bookingsCount", { count: point.totalCount })}
        </p>
        <p className="text-muted-foreground">
          {t("dashboard.monthlyOutlook.metricAvgBasket")} : {point.averageBasket.toFixed(2)} €
        </p>
      </div>
    </div>
  );
}

export function MonthlyOutlookChart({ data }: MonthlyOutlookChartProps) {
  const { t, i18n } = useTranslation("admin");
  const [metric, setMetric] = useState<OutlookMetric>("revenue");
  const locale = i18n.language?.startsWith("fr") ? fr : enUS;

  const chartData = useMemo<OutlookChartRow[]>(
    () =>
      data.map((p) => ({
        ...p,
        label: format(parseISO(`${p.monthKey}-01`), "MMM yy", { locale }),
        confirmed: metric === "bookings" ? p.confirmedCount : p.confirmedRevenue,
        pending: metric === "bookings" ? p.pendingCount : p.pendingRevenue,
      })),
    [data, metric, locale],
  );

  const currentLabel = chartData.find((p) => p.isCurrent)?.label;
  const hasData = data.some((p) => p.totalCount > 0);

  const metricButtons: Array<{ key: OutlookMetric; label: string }> = [
    { key: "revenue", label: t("dashboard.monthlyOutlook.metricRevenue") },
    { key: "bookings", label: t("dashboard.monthlyOutlook.metricBookings") },
    { key: "avgBasket", label: t("dashboard.monthlyOutlook.metricAvgBasket") },
  ];

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium text-foreground">
          {t("dashboard.monthlyOutlook.title")}
        </CardTitle>
        <div className="flex items-center gap-4">
          {metricButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setMetric(btn.key)}
              className={cn(
                "border-b-2 pb-0.5 text-xs transition-colors",
                metric === btn.key
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-12 text-center text-muted-foreground">
            {t("dashboard.monthlyOutlook.empty")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#666" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#666"
                allowDecimals={false}
                tickFormatter={(v: number) => (metric === "bookings" ? String(v) : formatCompactEuro(v))}
              />
              <Tooltip content={<OutlookTooltip />} />
              {metric !== "avgBasket" && (
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
              )}
              {currentLabel && (
                <ReferenceLine
                  x={currentLabel}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                  label={{
                    value: t("dashboard.monthlyOutlook.currentMonth"),
                    position: "top",
                    fontSize: 10,
                    fill: "#666",
                  }}
                />
              )}
              {metric === "avgBasket" ? (
                <Bar dataKey="averageBasket" name={t("dashboard.monthlyOutlook.metricAvgBasket")} fill={CONFIRMED_COLOR} radius={[4, 4, 0, 0]}>
                  {chartData.map((p) => (
                    <Cell key={p.monthKey} fillOpacity={p.isCurrent || p.isFuture ? BACKLOG_OPACITY : 1} />
                  ))}
                </Bar>
              ) : (
                <>
                  <Bar dataKey="confirmed" name={t("dashboard.monthlyOutlook.confirmed")} stackId="a" fill={CONFIRMED_COLOR}>
                    {chartData.map((p) => (
                      <Cell key={p.monthKey} fillOpacity={p.isCurrent || p.isFuture ? BACKLOG_OPACITY : 1} />
                    ))}
                  </Bar>
                  <Bar dataKey="pending" name={t("dashboard.monthlyOutlook.pending")} stackId="a" fill={PENDING_COLOR} radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
