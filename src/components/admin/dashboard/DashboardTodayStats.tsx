import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarClock, CalendarDays, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricHelp } from "@/components/admin/dashboard/MetricHelp";
import type { LeadTimeData, OccupancyData } from "@/hooks/useDashboardData";

interface StatLineProps {
  icon: ReactNode;
  value: ReactNode;
  caption: string;
}

function StatLine({ icon, value, caption }: StatLineProps) {
  return (
    <div className="stat-line">
      <span className="icon-disc">{icon}</span>
      <div>
        <div className="big">{value}</div>
        <div className="cap">{caption}</div>
      </div>
    </div>
  );
}

function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const value = rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${value} ${rounded <= 1 ? "jour" : "jours"}`;
}

interface DashboardTodayStatsProps {
  todayBookings: number;
  todayConfirmed: number;
  leadTime: LeadTimeData;
  activeTherapists: OccupancyData;
}

/**
 * Colonne centrale du trio : trois stats opérationnelles empilées
 * (activité du jour, délai moyen de réservation, thérapeutes disponibles).
 */
export function DashboardTodayStats({
  todayBookings,
  todayConfirmed,
  leadTime,
  activeTherapists,
}: DashboardTodayStatsProps) {
  const [showByTreatment, setShowByTreatment] = useState(false);
  const iconProps = { className: "h-[17px] w-[17px]", strokeWidth: 1.5 } as const;

  return (
    <div className="card flex flex-col gap-5">
      <div>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">Aujourd&apos;hui</h2>
          <MetricHelp>
            Réservations dont le soin a lieu <b>aujourd&apos;hui</b>, pour le lieu
            sélectionné. Ce compteur ignore volontairement le filtre de période. Le second
            chiffre isole celles au statut confirmé.
          </MetricHelp>
        </div>
        <StatLine
          icon={<CalendarDays {...iconProps} />}
          value={todayBookings}
          caption={`réservation${todayBookings > 1 ? "s" : ""} · ${todayConfirmed} confirmée${todayConfirmed > 1 ? "s" : ""}`}
        />
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18 }}>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">Délai de réservation</h2>
          {leadTime.byTreatment.length > 0 && (
            <button
              type="button"
              className="bo-btn ghost sm"
              onClick={() => setShowByTreatment((v) => !v)}
            >
              Par prestation
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showByTreatment && "rotate-180")}
              />
            </button>
          )}
          <MetricHelp>
            Nombre moyen de jours entre le moment où la réservation est <b>créée</b> et la
            date du soin. Le périmètre porte sur les réservations <b>créées</b> pendant la
            période — sinon les réservations prises pour plus tard, celles qui portent
            justement l&apos;anticipation, seraient exclues. Les délais négatifs (soin le
            jour même, saisi après coup) comptent pour zéro.
          </MetricHelp>
        </div>
        {leadTime.count === 0 ? (
          <p className="card-empty">Aucune donnée sur la période</p>
        ) : (
          <>
            <StatLine
              icon={<CalendarClock {...iconProps} />}
              value={formatDays(leadTime.averageDays)}
              caption={`en moyenne à l'avance · ${leadTime.count} réservation${leadTime.count > 1 ? "s" : ""}`}
            />
            {showByTreatment && (
              <div className="mt-4 space-y-1 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                {leadTime.byTreatment.map((t) => (
                  <div key={t.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate" style={{ color: "var(--ink-mute)" }}>
                      {t.name}
                    </span>
                    <span className="bo-num shrink-0">{formatDays(t.averageDays)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18 }}>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">Thérapeutes actifs</h2>
          <MetricHelp>
            Thérapeutes ayant déclaré une <b>disponibilité pour aujourd&apos;hui</b>, sur le
            total de ceux rattachés au lieu sélectionné. C&apos;est une déclaration de
            disponibilité, pas une charge réelle : un thérapeute disponible peut n&apos;avoir
            aucun soin planifié.
          </MetricHelp>
        </div>
        <StatLine
          icon={<Users {...iconProps} />}
          value={
            <>
              {activeTherapists.used}
              <span style={{ fontSize: 18, color: "var(--ink-mute)" }}>/{activeTherapists.total}</span>
            </>
          }
          caption="disponibles aujourd'hui"
        />
      </div>
    </div>
  );
}
