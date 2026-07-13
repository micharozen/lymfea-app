import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MonthlyOutlookByVenue, MonthlyOutlookPoint } from "@/hooks/useDashboardData";

type OutlookMetric = "revenue" | "bookings" | "avgBasket";

const CONFIRMED_COLOR = "hsl(18, 55%, 52%)";
const PENDING_COLOR = "#f59e0b";
// Mois courant + futurs = carnet de commandes, atténués vs le réalisé.
const BACKLOG_OPACITY = 0.55;
// Barres fines et aérées plutôt que remplissant tout le créneau.
const BAR_MAX_WIDTH = 28;

// Palette pour la vue « une ligne par lieu ». Le 1er lieu reprend la couleur
// de marque, les suivants sont des teintes distinctes et lisibles.
const VENUE_COLORS = [
  "hsl(18, 55%, 52%)",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#6366f1",
  "#ef4444",
  "#84cc16",
];

interface OutlookChartRow extends MonthlyOutlookPoint {
  label: string;
  confirmed: number;
  pending: number;
  total: number; // valeur affichée en label au-dessus de la barre (selon métrique)
}

interface MonthlyOutlookChartProps {
  data: MonthlyOutlookPoint[];
  byVenue: MonthlyOutlookByVenue;
}

function formatCompactEuro(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k €` : `${Math.round(value)} €`;
}

// Label affiché au-dessus de chaque barre : masqué si nul pour éviter le bruit.
function barLabelFormatter(metric: OutlookMetric) {
  return (value: number) => {
    if (!value) return "";
    return metric === "bookings" ? String(value) : formatCompactEuro(value);
  };
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

interface VenueChartRow {
  label: string;
  monthKey: string;
  isCurrent: boolean;
  isFuture: boolean;
  [venueId: string]: string | number | boolean;
}

function VenueTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: VenueChartRow }>;
  metric: OutlookMetric;
}) {
  const { t } = useTranslation("admin");
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const fmt = (v: number) => (metric === "bookings" ? String(v) : `${v.toFixed(2)} €`);
  const rows = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
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
        <p className="text-sm font-bold capitalize">{row.label}</p>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {row.isCurrent || row.isFuture
            ? t("dashboard.monthlyOutlook.backlog")
            : t("dashboard.monthlyOutlook.realized")}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t("dashboard.monthlyOutlook.empty")}</p>
        ) : (
          rows.map((p) => (
            <p key={p.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-foreground">{p.name}</span> : {fmt(p.value)}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

export function MonthlyOutlookChart({ data, byVenue }: MonthlyOutlookChartProps) {
  const { t, i18n } = useTranslation("admin");
  const [metric, setMetric] = useState<OutlookMetric>("revenue");
  const [perVenue, setPerVenue] = useState(false);
  const locale = i18n.language?.startsWith("fr") ? fr : enUS;

  const canSplitByVenue = byVenue.venues.length > 1;
  const showByVenue = perVenue && canSplitByVenue;

  const chartData = useMemo<OutlookChartRow[]>(
    () =>
      data.map((p) => ({
        ...p,
        label: format(parseISO(`${p.monthKey}-01`), "MMM yy", { locale }),
        confirmed: metric === "bookings" ? p.confirmedCount : p.confirmedRevenue,
        pending: metric === "bookings" ? p.pendingCount : p.pendingRevenue,
        total:
          metric === "bookings"
            ? p.totalCount
            : metric === "avgBasket"
              ? p.averageBasket
              : p.totalRevenue,
      })),
    [data, metric, locale],
  );

  const venueChartData = useMemo<VenueChartRow[]>(
    () =>
      byVenue.months.map((m) => {
        const row: VenueChartRow = {
          label: format(parseISO(`${m.monthKey}-01`), "MMM yy", { locale }),
          monthKey: m.monthKey,
          isCurrent: m.isCurrent,
          isFuture: m.isFuture,
        };
        byVenue.venues.forEach((v) => {
          const cell = m.byVenue[v.id];
          row[v.id] =
            metric === "bookings"
              ? cell?.count ?? 0
              : metric === "avgBasket"
                ? cell?.averageBasket ?? 0
                : cell?.revenue ?? 0;
        });
        return row;
      }),
    [byVenue, metric, locale],
  );

  const currentLabel = (showByVenue ? venueChartData : chartData).find((p) => p.isCurrent)?.label;
  const hasData = showByVenue ? byVenue.venues.length > 0 : data.some((p) => p.totalCount > 0);

  const metricButtons: Array<{ key: OutlookMetric; label: string }> = [
    { key: "revenue", label: t("dashboard.monthlyOutlook.metricRevenue") },
    { key: "bookings", label: t("dashboard.monthlyOutlook.metricBookings") },
    { key: "avgBasket", label: t("dashboard.monthlyOutlook.metricAvgBasket") },
  ];

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 space-y-0">
        <CardTitle className="text-base font-medium text-foreground">
          {t("dashboard.monthlyOutlook.title")}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canSplitByVenue && (
            <div className="flex items-center gap-2">
              <Switch id="outlook-per-venue" checked={perVenue} onCheckedChange={setPerVenue} />
              <Label htmlFor="outlook-per-venue" className="cursor-pointer text-xs text-muted-foreground">
                {t("dashboard.monthlyOutlook.byVenue")}
              </Label>
            </div>
          )}
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
        ) : showByVenue ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={venueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#666" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#666"
                allowDecimals={false}
                tickFormatter={(v: number) => (metric === "bookings" ? String(v) : formatCompactEuro(v))}
              />
              <Tooltip content={<VenueTooltip metric={metric} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
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
              {byVenue.venues.map((v, i) => (
                <Line
                  key={v.id}
                  type="monotone"
                  dataKey={v.id}
                  name={v.name}
                  stroke={VENUE_COLORS[i % VENUE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
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
                <Bar dataKey="averageBasket" name={t("dashboard.monthlyOutlook.metricAvgBasket")} fill={CONFIRMED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX_WIDTH}>
                  {chartData.map((p) => (
                    <Cell key={p.monthKey} fillOpacity={p.isCurrent || p.isFuture ? BACKLOG_OPACITY : 1} />
                  ))}
                </Bar>
              ) : (
                <>
                  <Bar dataKey="confirmed" name={t("dashboard.monthlyOutlook.confirmed")} stackId="a" fill={CONFIRMED_COLOR} maxBarSize={BAR_MAX_WIDTH}>
                    {chartData.map((p) => (
                      <Cell key={p.monthKey} fillOpacity={p.isCurrent || p.isFuture ? BACKLOG_OPACITY : 1} />
                    ))}
                  </Bar>
                  <Bar dataKey="pending" name={t("dashboard.monthlyOutlook.pending")} stackId="a" fill={PENDING_COLOR} radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX_WIDTH} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
