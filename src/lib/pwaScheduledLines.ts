import type { ScheduledTreatment } from "@/lib/therapistLegDuration";

/**
 * Le moteur d'ordonnancement partagé lit `duration` sur la ligne elle-même ; les
 * requêtes du PWA la portent dans `treatment_menus`. Cette projection évite de
 * dupliquer la règle d'exécution côté front — elle ne fait que rendre les lignes
 * lisibles par `scheduleTreatments` / `legWindowForLines`.
 */
export interface PwaScheduledLine {
  id?: string | null;
  therapist_id?: string | null;
  treatment_id?: string | null;
  is_addon?: boolean | null;
  created_at?: string | null;
  parent_booking_treatment_id?: string | null;
  treatment_menus?: { duration?: number | null } | null;
}

export const toScheduledLines = <L extends PwaScheduledLine>(
  lines: L[],
): (L & ScheduledTreatment)[] =>
  lines.map((l) => ({ ...l, duration: l.treatment_menus?.duration ?? null }));
