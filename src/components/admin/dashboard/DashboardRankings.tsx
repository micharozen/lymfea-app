import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/formatPrice";
import type { RankingItem } from "@/hooks/useDashboardData";

// ── Shared ranking list ─────────────────────────────────────────────

interface RankingListProps {
  items: RankingItem[];
  emptyMessage?: string;
  showRevenue?: boolean;
}

function RankingList({ items, emptyMessage, showRevenue = true }: RankingListProps) {
  const { t } = useTranslation(["admin", "common"]);

  if (items.length === 0) {
    return <p className="card-empty">{emptyMessage || t("common:noData")}</p>;
  }

  // La barre de proportion est relative au premier du classement.
  const max = Math.max(...items.map((i) => (showRevenue ? i.revenue : i.bookings)), 1);

  return (
    <div className="rank">
      {items.map((item, i) => {
        const weight = showRevenue ? item.revenue : item.bookings;
        return (
          <div key={i}>
            <span className="pos">{i + 1}</span>
            <div className="info">
              <div className="nm" title={item.name}>
                {item.name}
              </div>
              <div className="ct">
                {t("dashboardRankings.bookingCount", { count: item.bookings })}
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round((weight / max) * 100)}%` }} />
              </div>
            </div>
            {showRevenue && <span className="amt">{formatPrice(item.revenue)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Exported components ─────────────────────────────────────────────

interface DashboardRankingsProps {
  topVenues: RankingItem[];
  topTherapists: RankingItem[];
  topTreatments: RankingItem[];
  isSingleVenue: boolean;
}

type RankingTab = "venues" | "therapists" | "treatments";

const TABS: RankingTab[] = ["venues", "therapists", "treatments"];

export function DashboardRankings({
  topVenues,
  topTherapists,
  topTreatments,
  isSingleVenue,
}: DashboardRankingsProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [tab, setTab] = useState<RankingTab>(isSingleVenue ? "therapists" : "venues");

  return (
    <div className="card">
      <div className="tabs">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : undefined}
            disabled={key === "venues" && isSingleVenue}
            onClick={() => setTab(key)}
          >
            {t(`dashboardRankings.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === "venues" && (
        <RankingList
          items={isSingleVenue ? [] : topVenues}
          emptyMessage={
            isSingleVenue ? t("dashboardRankings.selectAllVenues") : t("common:noData")
          }
        />
      )}
      {tab === "therapists" && <RankingList items={topTherapists} />}
      {tab === "treatments" && <RankingList items={topTreatments} showRevenue={false} />}
    </div>
  );
}
