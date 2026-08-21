import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarClock, CalendarDays, ChevronDown, Users } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function formatDays(t: TFunction, days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const value = rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return t("dashboardToday.days", { count: rounded, value });
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
  const { t } = useTranslation(["admin", "common"]);
  const [showByTreatment, setShowByTreatment] = useState(false);
  const iconProps = { className: "h-[17px] w-[17px]", strokeWidth: 1.5 } as const;

  return (
    <div className="card flex flex-col gap-5">
      <div>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">{t("common:dates.today")}</h2>
          <MetricHelp>
            <Trans i18nKey="admin:dashboardToday.todayHelp" components={{ b: <b /> }} />
          </MetricHelp>
        </div>
        <StatLine
          icon={<CalendarDays {...iconProps} />}
          value={todayBookings}
          caption={`${t("dashboardToday.bookingsLabel", { count: todayBookings })} · ${t("dashboardToday.confirmedLabel", { count: todayConfirmed })}`}
        />
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18 }}>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">{t("dashboardToday.leadTimeTitle")}</h2>
          {leadTime.byTreatment.length > 0 && (
            <button
              type="button"
              className="bo-btn ghost sm"
              onClick={() => setShowByTreatment((v) => !v)}
            >
              {t("dashboardToday.byTreatment")}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showByTreatment && "rotate-180")}
              />
            </button>
          )}
          <MetricHelp>
            <Trans i18nKey="admin:dashboardToday.leadTimeHelp" components={{ b: <b /> }} />
          </MetricHelp>
        </div>
        {leadTime.count === 0 ? (
          <p className="card-empty">{t("dashboardToday.noDataForPeriod")}</p>
        ) : (
          <>
            <StatLine
              icon={<CalendarClock {...iconProps} />}
              value={formatDays(t, leadTime.averageDays)}
              caption={`${t("dashboardToday.onAverageInAdvance")} · ${t("dashboardToday.bookingsCount", { count: leadTime.count })}`}
            />
            {showByTreatment && (
              <div className="mt-4 space-y-1 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                {leadTime.byTreatment.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate" style={{ color: "var(--ink-mute)" }}>
                      {item.name}
                    </span>
                    <span className="bo-num shrink-0">{formatDays(t, item.averageDays)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18 }}>
        <div className="hd" style={{ marginBottom: 12 }}>
          <h2 className="bo-sec-title">{t("dashboardToday.activeTherapists")}</h2>
          <MetricHelp>
            <Trans
              i18nKey="admin:dashboardToday.activeTherapistsHelp"
              components={{ b: <b /> }}
            />
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
          caption={t("dashboardToday.availableToday")}
        />
      </div>
    </div>
  );
}
