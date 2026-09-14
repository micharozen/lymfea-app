import { Skeleton } from "@/components/ui/skeleton";

/**
 * Squelette de chargement du planning. Il reprend la forme de la vue qu'il
 * remplace (gouttière d'heures + colonnes de jours, ou en-tête + lignes de
 * tableau) : l'opérateur garde ses repères spatiaux entre deux chargements,
 * là où un loader centré fait passer l'écran du vide au dense.
 */
interface PlanningSkeletonProps {
  variant: "calendar" | "list";
  /** Nombre de colonnes de jours en vue calendrier. */
  dayCount?: number;
  /** Nombre de lignes en vue liste. */
  rowCount?: number;
}

export function PlanningSkeleton({ variant, dayCount = 5, rowCount = 12 }: PlanningSkeletonProps) {
  if (variant === "list") {
    return (
      <div className="flex-1 min-h-0 p-3" aria-busy="true">
        <div className="flex items-center gap-3 border-b border-border pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1 rounded-sm" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rowCount }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 py-[13px]">
              {Array.from({ length: 6 }).map((_, col) => (
                <Skeleton key={col} className="h-3.5 flex-1 rounded-sm" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-busy="true">
      {/* Bandeau des jours */}
      <div className="flex border-b border-border">
        <div className="w-14 flex-shrink-0" />
        {Array.from({ length: dayCount }).map((_, i) => (
          <div key={i} className="flex-1 border-l border-border px-2 py-2.5">
            <Skeleton className="h-3 w-16 rounded-sm" />
          </div>
        ))}
      </div>
      {/* Grille horaire */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-14 flex-shrink-0">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 border-b border-border/50 px-2 pt-1">
              <Skeleton className="h-2.5 w-8 rounded-sm" />
            </div>
          ))}
        </div>
        {Array.from({ length: dayCount }).map((_, day) => (
          <div key={day} className="flex-1 border-l border-border">
            {Array.from({ length: 10 }).map((_, hour) => (
              <div key={hour} className="h-14 border-b border-border/50 p-1">
                {/* Cartes réparties de façon stable : le squelette ne clignote
                    pas d'un rendu à l'autre. */}
                {(day + hour) % 3 === 0 && <Skeleton className="h-full w-full rounded-md" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
