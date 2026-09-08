import { Skeleton } from "@/components/ui/skeleton";

/**
 * Squelettes du dashboard admin.
 *
 * Chacun réutilise les classes de mise en page réelles de bo-refonte.css
 * (.alerts, .kpis, .card, .hd, .mix, .trio) plutôt que d'approximer la grille :
 * au remplacement par le vrai composant, rien ne bouge. Les hauteurs des zones
 * de graphe sont figées sur celles des conteneurs Recharts, pour la même
 * raison — les sections arrivant indépendamment, un écart se verrait comme un
 * saut de page.
 */

/** Bandeau d'alertes : quatre pastilles de largeurs inégales. */
export function AlertsSkeleton() {
  return (
    <div className="alerts">
      {[132, 168, 118, 152].map((w) => (
        <Skeleton key={w} className="h-[34px] rounded-full" style={{ width: w }} />
      ))}
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="kpi">
      <div className="top">
        <Skeleton className="h-[15px] w-[15px] rounded" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="val">
        <Skeleton className="mx-auto h-8 w-28" />
      </div>
      <div className="sub">
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

/** Ligne de KPI. `cols` suit la variante réelle : 2 pour les concierges. */
export function KpiRowSkeleton({ cols }: { cols: 2 | 4 }) {
  return (
    <div className={cols === 2 ? "kpis cols-2" : "kpis"}>
      {Array.from({ length: cols }, (_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Carte générique : en-tête + zone de contenu à hauteur fixée. */
export function CardSkeleton({ height }: { height: number }) {
  return (
    <div className="card">
      <div className="hd">
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="w-full rounded-md" style={{ height }} />
    </div>
  );
}

/** Mix clients + canal de réservation : la grille .mix porte trois cartes. */
export function ClientMixSkeleton() {
  return (
    <div className="mix">
      <CardSkeleton height={128} />
      <CardSkeleton height={128} />
      <CardSkeleton height={128} />
    </div>
  );
}

/**
 * Heatmap d'occupation. `rows` vient du référentiel, disponible avant les
 * réservations : le squelette a donc déjà la bonne hauteur.
 */
export function HeatmapSkeleton({ rows }: { rows: number }) {
  const lines = Math.min(Math.max(rows, 3), 12);
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="hd">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-32 flex-none" />
            <Skeleton className="h-6 flex-1 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Les trois cartes du bas : prévision, stats du jour, classements. */
export function TrioSkeleton() {
  return (
    <div className="trio">
      <CardSkeleton height={180} />
      <CardSkeleton height={180} />
      <CardSkeleton height={180} />
    </div>
  );
}
