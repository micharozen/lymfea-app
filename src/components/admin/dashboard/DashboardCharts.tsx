import { Fragment } from "react";
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
import type {
  ChartPoint,
  StatusSlice,
  ForecastPoint,
  RoomOccupancyHeatmap as RoomOccupancyHeatmapData,
  RoomHeatmapCell,
} from "@/hooks/useDashboardData";

// Palette « Saoma » — les tokens sont définis par .bo-refonte (bo-refonte.css)
// et résolus par le navigateur dans les attributs de présentation SVG.
const CLAY = "var(--clay)";
const WAIT = "var(--wait-dot)";
const GRID = "var(--line-soft)";

// Bulle de tooltip commune à tous les charts de l'Accueil.
const tooltipStyle = {
  backgroundColor: "var(--bo-surface)",
  border: "1px solid var(--line)",
  borderRadius: "10px",
  boxShadow: "var(--shadow-2)",
  fontSize: "12.5px",
  color: "var(--ink)",
} as const;

const axisTick = { fontSize: 10, fill: "var(--ink-mute)" } as const;

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
    <div style={{ ...tooltipStyle, padding: "8px 12px" }}>
      <p className="font-semibold mb-1">{label}</p>
      <p>{point.sales.toFixed(2)} €</p>
      <p style={{ color: "var(--ink-mute)", fontSize: "11.5px" }}>
        {point.prestations} prestation{point.prestations > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="card">
      <div className="hd">
        <h2 className="bo-sec-title">Ventes</h2>
        <span className="seg-note">CA / jour</span>
      </div>
      {data.length === 0 ? (
        <p className="card-empty">Aucune donnée de vente pour cette période</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CLAY} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={CLAY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 4" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} stroke={GRID} tickLine={false} />
              <YAxis tick={axisTick} stroke={GRID} tickLine={false} tickFormatter={(v) => `${v} €`} />
              <Tooltip content={<SalesTooltip />} />
              <Area
                type="monotone"
                dataKey="sales"
                stroke={CLAY}
                strokeWidth={2}
                fill="url(#salesGradient)"
                dot={{ fill: CLAY, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: CLAY }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Room Occupancy Heatmap (today, per room) ───────────────────────

interface RoomOccupancyHeatmapProps {
  data: RoomOccupancyHeatmapData;
}

// Couleur d'une case selon son taux d'occupation (0-100%) : dégradé vers le
// teal --heat, sur le fond neutre --bo-surface-2 quand la case est vide.
function cellBackground(cell: RoomHeatmapCell): string {
  if (cell.rate <= 0) return "var(--bo-surface-2)";
  return `color-mix(in srgb, var(--heat) ${Math.round(cell.rate)}%, var(--bo-surface-2))`;
}

export function RoomOccupancyHeatmap({ data }: RoomOccupancyHeatmapProps) {
  const { rooms, hours } = data;

  // Afficher un intitulé de lieu seulement quand la vue couvre plusieurs lieux.
  const showVenueGroups = new Set(rooms.map((r) => r.hotelId)).size > 1;

  // Colonne des noms (fixe) + une colonne par heure + colonne du % du jour.
  const gridTemplateColumns = `minmax(120px, 170px) repeat(${hours.length}, minmax(22px, 1fr)) 48px`;

  return (
    <div className="card full">
      <div className="hd">
        <h2 className="bo-sec-title">Occupation salles — aujourd&apos;hui</h2>
        <span className="heat-scale">
          0%
          <span className="g" />
          100%
        </span>
      </div>
      {rooms.length === 0 ? (
        <p className="card-empty">Aucune salle active</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="heat min-w-max" style={{ gridTemplateColumns }}>
            {/* En-tête : heures */}
            <div />
            {hours.map((h) => (
              <div key={h} className="hh">
                {String(h).padStart(2, "0")}
              </div>
            ))}
            <div className="hh" style={{ textAlign: "right" }}>
              Jour
            </div>

            {/* Lignes : une par salle, regroupées par lieu si vue multi-lieux */}
            {rooms.map((room, i) => {
              const isNewVenue = showVenueGroups && (i === 0 || rooms[i - 1].hotelId !== room.hotelId);
              return (
                <Fragment key={room.roomId}>
                  {isNewVenue && <div className="grp">{room.hotelName}</div>}
                  <div className="rm" title={room.roomName}>
                    {room.roomName}
                    {room.capacity > 1 && <span className="x">×{room.capacity}</span>}
                  </div>
                  {room.cells.map((cell) => (
                    <div
                      key={cell.hourIndex}
                      className="c"
                      style={{ background: cellBackground(cell) }}
                      title={`${room.roomName} · ${String(cell.hourIndex).padStart(2, "0")}h — ${cell.seats}/${cell.capacity} (${cell.rate}%)${cell.outOfHours ? " · hors horaires" : ""}`}
                    />
                  ))}
                  <div className="pct">{room.dayRate}%</div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Donut Chart ──────────────────────────────────────────────

interface StatusDonutProps {
  data: StatusSlice[];
}

export function StatusDonut({ data }: StatusDonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card">
      <div className="hd">
        <h2 className="bo-sec-title">Statuts</h2>
      </div>
      {total === 0 ? (
        <p className="card-empty">Aucune donnée</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={58} outerRadius={82} dataKey="value" stroke="none">
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [value, name]} />
              <text
                x="50%"
                y="48%"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontFamily: "var(--serif)", fontSize: "26px", fontWeight: 500, fill: "var(--ink)" }}
              >
                {total}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: "10px", fill: "var(--ink-mute)" }}
              >
                réservations
              </text>
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-legend">
            {data.map((entry, i) => (
              <div key={i}>
                <span className="bo-dot" style={{ background: entry.color }} />
                {entry.name}
                <span className="n">{entry.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Week Forecast Bar Chart ─────────────────────────────────────────

interface WeekForecastProps {
  data: ForecastPoint[];
}

export function WeekForecast({ data }: WeekForecastProps) {
  const hasData = data.some((d) => d.confirmed > 0 || d.pending > 0);

  return (
    <div className="card">
      <div className="hd">
        <h2 className="bo-sec-title">Prévisionnel 7 jours</h2>
        <span className="seg-note">résas / jour</span>
      </div>
      {!hasData ? (
        <p className="card-empty">Aucune réservation prévue cette semaine</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 4" stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={axisTick} stroke={GRID} tickLine={false} />
              <YAxis tick={axisTick} stroke={GRID} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--line-soft)" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11.5px" }} />
              <Bar dataKey="confirmed" name="Confirmé" stackId="a" fill={CLAY} />
              <Bar dataKey="pending" name="En attente" stackId="a" fill={WAIT} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
