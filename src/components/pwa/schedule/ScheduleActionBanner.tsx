import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ScheduleCompleteness } from "@/hooks/pwa/useScheduleCompleteness";
import { cn } from "@/lib/utils";

interface ScheduleActionBannerProps {
  completeness: ScheduleCompleteness;
  onGoToTemplate: () => void;
  onGoToMonthly: () => void;
  onApplyTemplate?: () => void;
  onCompletePartial?: () => void;
  applyingTemplate?: boolean;
  completingPartial?: boolean;
}

export function ScheduleActionBanner({
  completeness,
  onGoToTemplate,
  onGoToMonthly,
  onApplyTemplate,
  onCompletePartial,
  applyingTemplate = false,
  completingPartial = false,
}: ScheduleActionBannerProps) {
  const { t } = useTranslation("pwa");

  if (completeness.status === "complete") {
    return null;
  }

  if (completeness.status === "no_template") {
    return (
      <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("schedule.actionBanner.noTemplateTitle")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("schedule.actionBanner.noTemplateDesc")}
              </p>
            </div>
            <Button size="sm" className="w-full" onClick={onGoToTemplate}>
              {t("schedule.actionBanner.configureTemplate")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (completeness.status === "template_not_applied") {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
            <Sparkles className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("schedule.actionBanner.applyTitle", {
                  month: completeness.nextMonthLabel,
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("schedule.actionBanner.applyDesc")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {onApplyTemplate && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={onApplyTemplate}
                  disabled={applyingTemplate}
                >
                  {applyingTemplate
                    ? t("common:loading")
                    : t("schedule.actionBanner.applyNow")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={onGoToTemplate}
              >
                {t("schedule.actionBanner.reviewTemplate")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const targetTotal =
    completeness.expectedDaysCount > 0
      ? completeness.expectedDaysCount
      : completeness.horizonDays;
  const progressPercent = Math.round(
    (completeness.declaredDaysCount / targetTotal) * 100
  );

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("schedule.actionBanner.partialTitle", {
              count: completeness.declaredDaysCount,
              total: targetTotal,
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("schedule.actionBanner.partialDesc")}
          </p>
        </div>
        <Progress value={progressPercent} className="h-2" />
        {onCompletePartial && (
          <Button
            size="sm"
            className="w-full"
            onClick={onCompletePartial}
            disabled={completingPartial || applyingTemplate}
          >
            {completingPartial
              ? t("common:loading")
              : t("schedule.actionBanner.applyNow")}
          </Button>
        )}
        <button
          type="button"
          onClick={onGoToMonthly}
          className={cn(
            "text-xs font-medium text-primary flex items-center gap-0.5"
          )}
        >
          {t("schedule.actionBanner.reviewMonthly")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
