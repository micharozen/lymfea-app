import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPrice } from "@/lib/formatPrice";
import type { RankingItem } from "@/hooks/useDashboardData";

// ── Shared ranking list ─────────────────────────────────────────────

interface RankingListProps {
  items: RankingItem[];
  emptyMessage?: string;
  showRevenue?: boolean;
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
      {rank}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-medium">
      {initials}
    </span>
  );
}

function RankingList({ items, emptyMessage, showRevenue = true }: RankingListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {emptyMessage || "Aucune donnée"}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <RankBadge rank={i + 1} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.bookings} réservation{item.bookings > 1 ? "s" : ""}
            </p>
          </div>
          {showRevenue && (
            <span className="text-sm font-medium tabular-nums whitespace-nowrap">
              {formatPrice(item.revenue)}
            </span>
          )}
        </div>
      ))}
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

export function DashboardRankings({
  topVenues,
  topTherapists,
  topTreatments,
  isSingleVenue,
}: DashboardRankingsProps) {
  const [tab, setTab] = useState<RankingTab>(isSingleVenue ? "therapists" : "venues");

  return (
    <Card className="border border-border bg-card shadow-sm mb-6">
      <CardHeader className="pb-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RankingTab)}>
          <TabsList>
            <TabsTrigger value="venues" disabled={isSingleVenue}>
              Lieux
            </TabsTrigger>
            <TabsTrigger value="therapists">Thérapeutes</TabsTrigger>
            <TabsTrigger value="treatments">Soins</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {tab === "venues" && (
          <RankingList
            items={isSingleVenue ? [] : topVenues}
            emptyMessage={isSingleVenue ? "Sélectionnez «Tous les lieux»" : "Aucune donnée"}
          />
        )}
        {tab === "therapists" && <RankingList items={topTherapists} />}
        {tab === "treatments" && <RankingList items={topTreatments} showRevenue={false} />}
      </CardContent>
    </Card>
  );
}
