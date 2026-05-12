import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/formatPrice";
import type { RankingItem } from "@/hooks/useDashboardData";

// ── Shared ranking list ─────────────────────────────────────────────

interface RankingCardProps {
  title: string;
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

function RankingCard({ title, items, emptyMessage, showRevenue = true }: RankingCardProps) {
  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {emptyMessage || "Aucune donnée"}
          </p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}

// ── Exported components ─────────────────────────────────────────────

interface DashboardRankingsProps {
  topVenues: RankingItem[];
  topTherapists: RankingItem[];
  topTreatments: RankingItem[];
  isSingleVenue: boolean;
}

export function DashboardRankings({
  topVenues,
  topTherapists,
  topTreatments,
  isSingleVenue,
}: DashboardRankingsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <RankingCard
        title="Top 3 lieux"
        items={isSingleVenue ? [] : topVenues}
        emptyMessage={isSingleVenue ? "Sélectionnez «Tous les lieux»" : "Aucune donnée"}
      />
      <RankingCard title="Top 3 thérapeutes" items={topTherapists} />
      <RankingCard title="Top 3 soins" items={topTreatments} showRevenue={false} />
    </div>
  );
}
