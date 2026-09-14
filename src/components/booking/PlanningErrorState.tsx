import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * Échec du chargement du planning. Sans cet état, le loader s'arrête et
 * l'écran affiche un planning vide : l'opérateur lit « aucune réservation »
 * là où la donnée n'a simplement pas été récupérée.
 */
interface PlanningErrorStateProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

export function PlanningErrorState({ onRetry, isRetrying = false }: PlanningErrorStateProps) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{t("planning.loadError.title")}</p>
        <p className="text-xs text-muted-foreground max-w-[42ch]">
          {t("planning.loadError.body")}
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onRetry} disabled={isRetrying}>
        {t("planning.loadError.retry")}
      </Button>
    </div>
  );
}
