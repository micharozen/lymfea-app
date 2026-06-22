import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleReminderBannerProps {
  incomplete: boolean;
  variant?: "dashboard" | "agenda";
  /** Shown on the right when status is partial (e.g. 7/10) */
  partialProgress?: { count: number; total: number };
  className?: string;
}

export function ScheduleReminderBanner({
  incomplete,
  variant = "agenda",
  partialProgress,
  className,
}: ScheduleReminderBannerProps) {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();
  const isCompact = variant === "dashboard";

  if (isCompact) {
    return (
      <button
        type="button"
        onClick={() => navigate("/pwa/schedule")}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 active:scale-[0.99]",
          className
        )}
      >
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {t("bookings.editSchedule")}
        </span>
        {partialProgress && (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {partialProgress.count}/{partialProgress.total}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  const title = t("bookings.editSchedule");
  const description = incomplete ? t("bookings.scheduleIncomplete") : null;

  return (
    <button
      type="button"
      onClick={() => navigate("/pwa/schedule")}
      className={cn(
        "w-full rounded-xl border px-4 py-3 flex items-center gap-3 text-left transition-colors active:scale-[0.99]",
        incomplete
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-border bg-card hover:bg-muted/50",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full p-2 shrink-0",
          incomplete ? "bg-amber-500/15" : "bg-muted"
        )}
      >
        <CalendarClock
          className={cn(
            "h-5 w-5",
            incomplete ? "text-amber-600" : "text-muted-foreground"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </button>
  );
}
