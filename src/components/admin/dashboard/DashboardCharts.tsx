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
  ReferenceArea,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ChartPoint,
  StatusSlice,
  ForecastPoint,
  HourlyOccupancyPoint,
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

// ── Room Occupancy Hourly Chart ────────────────────────────────────

interface RoomOccupancyChartProps {
  data: HourlyOccupancyPoint[];
  openingHour: number;
  closingHour: number;
}

export function RoomOccupancyChart({ data, openingHour, closingHour }: RoomOccupancyChartProps) {
  const totalRooms = data[0]?.total ?? 0;

  if (totalRooms === 0) {
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

  const startHour = data[0]?.hourIndex ?? openingHour;
  const endHour = (data[data.length - 1]?.hourIndex ?? closingHour) + 1;
  const leftBufferEnd = `${String(openingHour).padStart(2, "0")}h`;
  const rightBufferStart = `${String(closingHour).padStart(2, "0")}h`;
  const hasLeftBuffer = startHour < openingHour;
  const hasRightBuffer = endHour > closingHour;

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-medium text-foreground">
          Occupation salles — aujourd'hui
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="roomOccupancyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(180, 45%, 45%)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(180, 45%, 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="#666" />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#666"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            {hasLeftBuffer && (
              <ReferenceArea
                x1={`${String(startHour).padStart(2, "0")}h`}
                x2={leftBufferEnd}
                fill="#9ca3af"
                fillOpacity={0.08}
              />
            )}
            {hasRightBuffer && (
              <ReferenceArea
                x1={rightBufferStart}
                x2={`${String(endHour - 1).padStart(2, "0")}h`}
                fill="#9ca3af"
                fillOpacity={0.08}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
              labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
              formatter={(_value: number, _name: string, item: { payload: HourlyOccupancyPoint }) => {
                const p = item.payload;
                const label = `${p.used}/${p.total} salles (${p.rate}%)${p.outOfHours ? " · Hors horaires" : ""}`;
                return [label, "Occupation"];
              }}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="hsl(180, 45%, 45%)"
              strokeWidth={2}
              fill="url(#roomOccupancyGradient)"
              dot={{ fill: "hsl(180, 45%, 45%)", strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: "hsl(180, 45%, 45%)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
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
