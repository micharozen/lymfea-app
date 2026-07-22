import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricHelpProps {
  /** Explication du calcul, affichée au survol / au focus clavier. */
  children: ReactNode;
}

/**
 * Petite icône d'aide posée à droite du libellé d'une métrique. Le contenu
 * du tooltip est rendu dans un portail (hors du DOM de la page) : on lui
 * repose la classe .bo-refonte pour qu'il hérite des tokens Saoma.
 *
 * Le déclencheur est un <button> : Radix ouvre aussi le tooltip au focus,
 * ce qui rend l'explication atteignable au clavier.
 */
export function MetricHelp({ children }: MetricHelpProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="metric-help" aria-label="Comment cette métrique est calculée">
          <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="bo-refonte metric-help-tip">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
