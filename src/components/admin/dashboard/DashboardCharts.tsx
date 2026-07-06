import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ChartPoint,
  StatusSlice,
  ForecastPoint,
  RoomOccupancyHeatmap as RoomOccupancyHeatmapData,
  RoomHeatmapCell,
  LeadTimeData,
} from "@/hooks/useDashboardData";

// ── Sales Area Chart ────────────────────────────────────────────────

interface SalesChartProps {
  data: ChartPoint[];
}

function SalesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
}) {
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
      <p className="text-sm font-bold mb-1">{label}</p>
      <p className="text-sm">{point.sales.toFixed(2)} €</p>
      <p className="text-xs text-muted-foreground">
        {point.prestations} prestation{point.prestations > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function SalesChart({ data }: SalesChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Aucune donnée de vente pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-medium text-foreground">Ventes</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(18, 55%, 52%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(18, 55%, 52%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#666" />
            <YAxis tick={{ fontSize: 12 }} stroke="#666" tickFormatter={(v) => `${v} €`} />
            <Tooltip content={<SalesTooltip />} />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="hsl(18, 55%, 52%)"
              strokeWidth={2}
              fill="url(#salesGradient)"
              dot={{ fill: "hsl(18, 55%, 52%)", strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: "hsl(18, 55%, 52%)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Room Occupancy Heatmap (today, per room) ───────────────────────

interface RoomOccupancyHeatmapProps {
  data: RoomOccupancyHeatmapData;
}

// Couleur d'une case selon son taux d'occupation (0-100%).
function cellBackground(cell: RoomHeatmapCell): string {
  if (cell.rate <= 0) {
    // Case vide : gris très léger hors horaires, quasi transparent en horaires.
    return cell.outOfHours ? "hsl(0 0% 60% / 0.10)" : "hsl(180 45% 45% / 0.06)";
  }
  // Occupée : teinte teal dont l'opacité croît avec le taux.
  const alpha = 0.2 + (cell.rate / 100) * 0.8;
  return `hsl(180 45% 45% / ${alpha})`;
}

export function RoomOccupancyHeatmap({ data }: RoomOccupancyHeatmapProps) {
  const { rooms, hours } = data;

  // Afficher un intitulé de lieu seulement quand la vue couvre plusieurs lieux.
  const showVenueGroups = new Set(rooms.map((r) => r.hotelId)).size > 1;

  if (rooms.length === 0) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium text-foreground">
            Occupation salles — aujourd'hui
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Aucune salle active</p>
        </CardContent>
      </Card>
    );
  }

  // Colonne des noms (fixe) + une colonne par heure + colonne du % du jour.
  const gridTemplateColumns = `minmax(120px, 160px) repeat(${hours.length}, minmax(22px, 1fr)) 48px`;

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium text-foreground">
          Occupation salles — aujourd'hui
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>0%</span>
          <span
            className="h-2.5 w-16 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, hsl(180 45% 45% / 0.06), hsl(180 45% 45% / 1))",
            }}
          />
          <span>100%</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Header : heures */}
            <div className="grid items-end" style={{ gridTemplateColumns }}>
              <div />
              {hours.map((h) => (
                <div key={h} className="pb-1 text-center text-[10px] text-muted-foreground">
                  {String(h).padStart(2, "0")}
                </div>
              ))}
              <div className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
                Jour
              </div>
            </div>

            {/* Lignes : une par salle, regroupées par lieu si vue multi-lieux */}
            {rooms.map((room, i) => {
              const isNewVenue = showVenueGroups && (i === 0 || rooms[i - 1].hotelId !== room.hotelId);
              return (
                <div key={room.roomId}>
                  {isNewVenue && (
                    <div className="mt-3 mb-1 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {room.hotelName}
                    </div>
                  )}
                  <div className="grid items-center py-0.5" style={{ gridTemplateColumns }}>
                    <div className="flex items-baseline gap-1.5 pr-2 min-w-0">
                      <span className="truncate text-sm text-foreground" title={room.roomName}>
                        {room.roomName}
                      </span>
                      {room.capacity > 1 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          ×{room.capacity}
                        </span>
                      )}
                    </div>
                    {room.cells.map((cell) => (
                      <div key={cell.hourIndex} className="px-px">
                        <div
                          className="h-6 w-full rounded-sm"
                          style={{ backgroundColor: cellBackground(cell) }}
                          title={`${room.roomName} · ${String(cell.hourIndex).padStart(2, "0")}h — ${cell.seats}/${cell.capacity} (${cell.rate}%)${cell.outOfHours ? " · hors horaires" : ""}`}
                        />
                      </div>
                    ))}
                    <div className="text-center text-xs font-semibold text-foreground">
                      {room.dayRate}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Status Donut Chart ──────────────────────────────────────────────

interface StatusDonutProps {
  data: StatusSlice[];
}

export function StatusDonut({ data }: StatusDonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Aucune donnée</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-medium text-foreground">Statuts</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
              formatter={(value: number, name: string) => [value, name]}
            />
            <text
              x="50%"
              y="45%"
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground"
              style={{ fontSize: "24px", fontWeight: 600 }}
            >
              {total}
            </text>
          </PieChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 -mt-4">
          {data.map((entry, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name} ({entry.value})
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Week Forecast Bar Chart ─────────────────────────────────────────

interface WeekForecastProps {
  data: ForecastPoint[];
}

export function WeekForecast({ data }: WeekForecastProps) {
  const hasData = data.some((d) => d.confirmed > 0 || d.pending > 0);

  if (!hasData) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Aucune réservation prévue cette semaine</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-medium text-foreground">Prévisionnel 7 jours</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#666" />
            <YAxis tick={{ fontSize: 12 }} stroke="#666" allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "12px" }}
            />
            <Bar dataKey="confirmed" name="Confirmé" stackId="a" fill="hsl(18, 55%, 52%)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="pending" name="En attente" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Booking Lead Time ───────────────────────────────────────────────

interface BookingLeadTimeProps {
  data: LeadTimeData;
}

function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const value = rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${value} ${rounded <= 1 ? "jour" : "jours"}`;
}

export function BookingLeadTime({ data }: BookingLeadTimeProps) {
  const [showByTreatment, setShowByTreatment] = useState(false);

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium text-foreground">
          Délai de réservation
        </CardTitle>
        {data.byTreatment.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setShowByTreatment((v) => !v)}
          >
            Par prestation
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showByTreatment && "rotate-180")}
            />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {data.count === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune donnée sur la période
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{formatDays(data.averageDays)}</p>
                <p className="text-xs text-muted-foreground">
                  en moyenne à l'avance · {data.count} réservation{data.count > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {showByTreatment && (
              <div className="mt-4 space-y-1 border-t border-border pt-3">
                {data.byTreatment.map((t) => (
                  <div key={t.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{t.name}</span>
                    <span className="shrink-0 font-medium text-foreground">
                      {formatDays(t.averageDays)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
