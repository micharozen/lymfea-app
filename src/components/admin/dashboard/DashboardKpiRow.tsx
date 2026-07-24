import type { ReactNode } from "react";
import { Ban, CalendarCheck, Euro, ShoppingBasket } from "lucide-react";
import { MetricHelp } from "@/components/admin/dashboard/MetricHelp";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Unité affichée en plus petit à droite de la valeur (€, %…). */
  unit?: string;
  trend?: number;
  /** Texte de la ligne du bas, à droite du badge de tendance. */
  caption?: string;
  /** Explication du calcul, affichée au survol de l'icône d'aide. */
  help?: ReactNode;
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

export function KpiCard({ icon, label, value, unit, trend, caption, help }: KpiCardProps) {
  return (
    <div className="kpi">
      <div className="top">
        {icon}
        <span className="lbl">{label}</span>
        {help && <MetricHelp>{help}</MetricHelp>}
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
          help={
            <>
              Somme des montants TTC des réservations dont la <b>date de soin</b> tombe
              dans la période et le lieu sélectionnés. Les réservations annulées et les
              no-show sont exclues. Les montants dans une autre devise sont convertis en
              euros au taux du jour.
              <br />
              L&apos;évolution compare à la période de même durée qui précède
              immédiatement.
            </>
          }
        />
      )}
      <KpiCard
        icon={<CalendarCheck {...iconProps} />}
        label="Réservations"
        value={totalBookings.toLocaleString("fr-FR")}
        trend={bookingsTrend}
        caption="vs période précédente"
        help={
          <>
            Nombre de réservations dont la <b>date de soin</b> tombe dans la période et le
            lieu sélectionnés, <b>tous statuts confondus</b> — les annulations sont donc
            comptées ici.
            <br />
            L&apos;évolution compare à la période de même durée qui précède immédiatement.
          </>
        }
      />
      {showRevenue && (
        <KpiCard
          icon={<ShoppingBasket {...iconProps} />}
          label="Panier moyen"
          value={formatBasket(averageBasket)}
          unit="€"
          help={
            <>
              Chiffre d&apos;affaires divisé par le nombre de réservations qui génèrent du
              revenu (hors annulées et no-show). C&apos;est une moyenne par réservation, pas
              par soin : une réservation de plusieurs prestations compte pour une.
            </>
          }
        />
      )}
      <KpiCard
        icon={<Ban {...iconProps} />}
        label="Taux d'annulation"
        value={String(cancellationRate)}
        unit="%"
        caption={`${cancelledCount} annulation${cancelledCount > 1 ? "s" : ""}`}
        help={
          <>
            Part des réservations au statut <b>annulé</b> parmi toutes celles de la période
            et du lieu. Les no-show ne sont pas comptés comme des annulations.
          </>
        }
      />
    </div>
  );
}
