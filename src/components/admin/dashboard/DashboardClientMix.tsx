import { Clock, Globe } from "lucide-react";
import type { BookingChannelData, ClientMixData } from "@/hooks/useDashboardData";

interface DashboardClientMixProps {
  clientMix: ClientMixData;
  bookingChannel: BookingChannelData;
}

/** Évolution d'un segment du mix, en vert/rouge selon le signe. Rien si nulle. */
function MixTrend({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <>
      {" · "}
      <b style={{ color: value > 0 ? "var(--ok)" : "var(--bad)" }}>
        {value > 0 ? "+" : ""}
        {value}%
      </b>{" "}
      vs période préc.
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
  const { hotel, external, total } = clientMix;
  const { online, manual } = bookingChannel;
  const iconProps = { className: "h-[15px] w-[15px]", strokeWidth: 1.5 } as const;

  return (
    <div className="mix">
      <div className="card">
        <div className="hd">
          <h2 className="bo-sec-title">Mix clients</h2>
          <span className="seg-note">
            {total} réservation{total > 1 ? "s" : ""}
          </span>
        </div>
        <div className="split">
          <i className="a" style={{ width: `${hotel.share}%` }} title={`Clients hôtel ${hotel.share}%`} />
          <i className="b" style={{ width: `${external.share}%` }} title={`Clients externes ${external.share}%`} />
        </div>
        <div className="mix-rows">
          <div className="mix-row">
            <span className="k">
              <span className="bo-dot" style={{ background: "var(--clay)" }} />
              Clients hôtel
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
              Clients externes
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
          <span className="lbl">Réservations en ligne</span>
        </div>
        <div className="val">{online.count}</div>
        <div className="hero-bar">
          <i style={{ width: `${online.share}%` }} />
        </div>
        <div className="sub">
          <PointsDelta value={online.shareDelta} />
          <span className="share">{online.share}% du total</span>
        </div>
      </div>

      <div className="kpi">
        <div className="top">
          <Clock {...iconProps} />
          <span className="lbl">Manuelles / téléphone</span>
        </div>
        <div className="val">{manual.count}</div>
        <div className="sub">
          <PointsDelta value={manual.shareDelta} />
          {manual.share}% du total
        </div>
      </div>
    </div>
  );
}
