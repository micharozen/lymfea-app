import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Circle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetupState } from "@/lib/venueSetup/api";
import type { StepId } from "@shared/venueSetup/spec";
import { sectionObject } from "../types";

interface SummaryStepProps {
  state: SetupState;
  steps: StepId[];
  submitting: boolean;
  onGoTo: (step: StepId) => void;
  onSubmit: () => void;
}

/** Fields the import cannot do without. */
function missingRequired(state: SetupState): string[] {
  const hotel = sectionObject(state, "hotel");
  const org = sectionObject(state, "organization");
  const missing: string[] = [];
  if (!org.commercial_name && !state.organization?.name) missing.push("company.commercialName");
  if (!hotel.name) missing.push("venue.name");
  if (!hotel.venue_type) missing.push("venue.type");
  if (!hotel.address) missing.push("fields.address");
  if (!hotel.city) missing.push("fields.city");
  return missing;
}

export function SummaryStep({ state, steps, submitting, onGoTo, onSubmit }: SummaryStepProps) {
  const { t } = useTranslation("setup");
  const done = new Set(state.data._completed_steps ?? []);
  const missing = missingRequired(state);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("summary.intro")}</p>

      <ul className="rounded-lg border divide-y">
        {steps.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onGoTo(s)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40"
            >
              {done.has(s) ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-sm flex-1">{t(`steps.${s}`)}</span>
              <span className="text-xs text-muted-foreground">
                {done.has(s) ? t("summary.done") : t("summary.todo")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p>{t("summary.missing")}</p>
            <p className="text-muted-foreground mt-1">{missing.map((k) => t(k)).join(", ")}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <p className="text-sm">{t("summary.submitIntro")}</p>
        <Button onClick={onSubmit} disabled={missing.length > 0 || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          {t("summary.submit")}
        </Button>
      </div>
    </div>
  );
}
