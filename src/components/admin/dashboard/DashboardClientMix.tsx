import { Clock, Globe } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { MetricHelp } from "@/components/admin/dashboard/MetricHelp";
import type { BookingChannelData, ClientMixData } from "@/hooks/useDashboardData";

interface DashboardClientMixProps {
  clientMix: ClientMixData;
  bookingChannel: BookingChannelData;
}

/** Évolution d'un segment du mix, en vert/rouge selon le signe. Rien si nulle. */
function MixTrend({ value }: { value: number }) {
  const { t } = useTranslation(["admin", "common"]);
  if (value === 0) return null;
  return (
    <>
      {" · "}
      <b style={{ color: value > 0 ? "var(--ok)" : "var(--bad)" }}>
        {value > 0 ? "+" : ""}
        {value}%
      </b>{" "}
      {t("dashboardClientMix.vsPreviousPeriod")}
    </>
  );
}

/** Badge d'écart de part, exprimé en points (« +18 pts »). Rien si nul. */
function PointsDelta({ value }: { value: number }) {
  if (value > 0) return <span className="trend up">↗ +{value} pts</span>;
  if (value < 0) return <span className="trend down">↘ {value} pts</span>;
  return null;
}

export function DashboardClientMix({ clientMix, bookingChannel }: DashboardClientMixProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { hotel, external, total } = clientMix;
  const { online, manual } = bookingChannel;
  const iconProps = { className: "h-[15px] w-[15px]", strokeWidth: 1.5 } as const;

  return (
    <div className="mix">
      <div className="card">
        <div className="hd">
          <h2 className="bo-sec-title">{t("dashboardClientMix.title")}</h2>
          <span className="seg-note">
            {t("dashboardClientMix.bookingCount", { count: total })}
          </span>
          <MetricHelp>
            <Trans i18nKey="dashboardClientMix.help" ns="admin" components={{ b: <b /> }} />
          </MetricHelp>
        </div>
        <div className="split">
          <i className="a" style={{ width: `${hotel.share}%` }} title={`${t("dashboardClientMix.hotelClients")} ${hotel.share}%`} />
          <i className="b" style={{ width: `${external.share}%` }} title={`${t("dashboardClientMix.externalClients")} ${external.share}%`} />
        </div>
        <div className="mix-rows">
          <div className="mix-row">
            <span className="k">
              <span className="bo-dot" style={{ background: "var(--clay)" }} />
              {t("dashboardClientMix.hotelClients")}
            </span>
            <span className="v">{hotel.count}</span>
            <span className="m">
              {hotel.share}%
              <MixTrend value={hotel.trend} />
            </span>
          </div>
          <div className="mix-row">
            <span className="k">
              <span className="bo-dot" style={{ background: "var(--gold)" }} />
              {t("dashboardClientMix.externalClients")}
            </span>
            <span className="v">{external.count}</span>
            <span className="m">
              {external.share}%
              <MixTrend value={external.trend} />
            </span>
          </div>
        </div>
      </div>

      {/* Réservations en ligne — carte mise en avant (dégradé clay) */}
      <div className="kpi hero">
        <div className="top">
          <Globe {...iconProps} />
          <span className="lbl">{t("dashboardClientMix.onlineBookings")}</span>
          <MetricHelp>
            <Trans i18nKey="dashboardClientMix.onlineHelp" ns="admin" components={{ b: <b /> }} />
          </MetricHelp>
        </div>
        <div className="val">{online.count}</div>
        <div className="hero-bar">
          <i style={{ width: `${online.share}%` }} />
        </div>
        <div className="sub">
          <PointsDelta value={online.shareDelta} />
          <span className="share">{t("dashboardClientMix.shareOfTotal", { value: online.share })}</span>
        </div>
      </div>

      <div className="kpi">
        <div className="top">
          <Clock {...iconProps} />
          <span className="lbl">{t("dashboardClientMix.manualPhone")}</span>
          <MetricHelp>
            {t("dashboardClientMix.manualHelp")}
          </MetricHelp>
        </div>
        <div className="val">{manual.count}</div>
        <div className="sub">
          <PointsDelta value={manual.shareDelta} />
          {t("dashboardClientMix.shareOfTotal", { value: manual.share })}
        </div>
      </div>
    </div>
  );
}
