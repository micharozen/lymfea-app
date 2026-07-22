import { useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import type { RankingItem } from "@/hooks/useDashboardData";

// ── Shared ranking list ─────────────────────────────────────────────

interface RankingListProps {
  items: RankingItem[];
  emptyMessage?: string;
  showRevenue?: boolean;
}

function RankingList({ items, emptyMessage, showRevenue = true }: RankingListProps) {
  if (items.length === 0) {
    return <p className="card-empty">{emptyMessage || "Aucune donnée"}</p>;
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
                {item.bookings} réservation{item.bookings > 1 ? "s" : ""}
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

const TABS: Array<{ key: RankingTab; label: string }> = [
  { key: "venues", label: "Lieux" },
  { key: "therapists", label: "Thérapeutes" },
  { key: "treatments", label: "Soins" },
];

export function DashboardRankings({
  topVenues,
  topTherapists,
  topTreatments,
  isSingleVenue,
}: DashboardRankingsProps) {
  const [tab, setTab] = useState<RankingTab>(isSingleVenue ? "therapists" : "venues");

  return (
    <div className="card">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "active" : undefined}
            disabled={t.key === "venues" && isSingleVenue}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "venues" && (
        <RankingList
          items={isSingleVenue ? [] : topVenues}
          emptyMessage={isSingleVenue ? "Sélectionnez «Tous les lieux»" : "Aucune donnée"}
        />
      )}
      {tab === "therapists" && <RankingList items={topTherapists} />}
      {tab === "treatments" && <RankingList items={topTreatments} showRevenue={false} />}
    </div>
  );
}
