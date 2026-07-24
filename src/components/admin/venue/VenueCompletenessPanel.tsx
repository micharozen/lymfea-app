import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { scrollToVenueSection } from "@/components/admin/venue/VenueSectionNav";
import type { VenueCheckItem } from "@/hooks/useVenueCompleteness";

interface VenueCompletenessPanelProps {
  percent: number;
  items: VenueCheckItem[];
}

function percentColor(percent: number): string {
  if (percent >= 90) return "text-emerald-600";
  if (percent >= 50) return "text-amber-600";
  return "text-red-600";
}

/**
 * Collapsible checklist showing how completely a venue's booking-flow
 * configuration has been filled in. Each missing item scrolls to its section.
 */
export function VenueCompletenessPanel({ percent, items }: VenueCompletenessPanelProps) {
  const { t: tAdmin } = useTranslation("admin");
  const [open, setOpen] = useState(false);

  // `na` items are not shown — they don't apply to this venue's config.
  const visible = items.filter((i) => i.status !== "na");

  // Configuration complète : rien à signaler, on n'affiche pas le panneau.
  if (percent >= 100) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 w-full max-w-sm rounded-lg border bg-card"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">
          {tAdmin("venue.completeness.title", "Complétude de la configuration")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Progress value={percent} className="hidden h-1.5 w-16 sm:block" />
          <span className={cn("text-xs font-semibold tabular-nums", percentColor(percent))}>
            {percent}%
          </span>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul className="space-y-0.5 px-2 pb-2">
          {visible.map((item) => {
            const ok = item.status === "ok";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollToVenueSection(item.sectionId)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>
                    {item.label}
                  </span>
                  {!ok && (
                    <span className="ml-auto text-[11px] text-amber-600">
                      {tAdmin("venue.completeness.missing", "À renseigner")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
