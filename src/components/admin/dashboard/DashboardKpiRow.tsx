import type { ReactNode } from "react";
import { Ban, CalendarCheck, Euro, ShoppingBasket } from "lucide-react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Unité affichée en plus petit à droite de la valeur (€, %…). */
  unit?: string;
  trend?: number;
  /** Texte de la ligne du bas, à droite du badge de tendance. */
  caption?: string;
}

/**
 * Badge d'évolution. Pas de badge quand la tendance est nulle (y compris
 * lorsque la période précédente est vide) : on n'affiche que le caption.
 */
function Trend({ value }: { value: number }) {
  if (value > 0) return <span className="trend up">↗ +{value}%</span>;
  if (value < 0) return <span className="trend down">↘ {value}%</span>;
  return null;
}

export function KpiCard({ icon, label, value, unit, trend, caption }: KpiCardProps) {
  return (
    <div className="kpi">
      <div className="top">
        {icon}
        <span className="lbl">{label}</span>
      </div>
      <div className="val">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="sub">
        {trend !== undefined && <Trend value={trend} />}
        {caption}
      </div>
    </div>
  );
}

/** Formate un montant en entier séparé par des espaces fines (56 338). */
function formatAmount(raw: string): string {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("fr-FR");
}

/** Formate un panier moyen avec 2 décimales (143,72). */
function formatBasket(raw: string): string {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DashboardKpiRowProps {
  totalSales: string;
  salesTrend: number;
  averageBasket: string;
  totalBookings: number;
  bookingsTrend: number;
  cancellationRate: number;
  cancelledCount: number;
  /** Les concierges ne voient ni le CA ni le panier moyen. */
  showRevenue: boolean;
}

export function DashboardKpiRow({
  totalSales,
  salesTrend,
  averageBasket,
  totalBookings,
  bookingsTrend,
  cancellationRate,
  cancelledCount,
  showRevenue,
}: DashboardKpiRowProps) {
  const iconProps = { className: "h-[15px] w-[15px]", strokeWidth: 1.5 } as const;

  return (
    <div className={showRevenue ? "kpis" : "kpis cols-2"}>
      {showRevenue && (
        <KpiCard
          icon={<Euro {...iconProps} />}
          label="Chiffre d'affaires"
          value={formatAmount(totalSales)}
          unit="€"
          trend={salesTrend}
          caption="vs période précédente"
        />
      )}
      <KpiCard
        icon={<CalendarCheck {...iconProps} />}
        label="Réservations"
        value={totalBookings.toLocaleString("fr-FR")}
        trend={bookingsTrend}
        caption="vs période précédente"
      />
      {showRevenue && (
        <KpiCard
          icon={<ShoppingBasket {...iconProps} />}
          label="Panier moyen"
          value={formatBasket(averageBasket)}
          unit="€"
        />
      )}
      <KpiCard
        icon={<Ban {...iconProps} />}
        label="Taux d'annulation"
        value={String(cancellationRate)}
        unit="%"
        caption={`${cancelledCount} annulation${cancelledCount > 1 ? "s" : ""}`}
      />
    </div>
  );
}
