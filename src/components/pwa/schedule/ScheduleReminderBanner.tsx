import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleReminderBannerProps {
  incomplete: boolean;
  className?: string;
}

export function ScheduleReminderBanner({
  incomplete,
  className,
}: ScheduleReminderBannerProps) {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();

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
        <p className="text-sm font-medium text-foreground">
          {t("bookings.editSchedule")}
        </p>
        {incomplete && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("bookings.scheduleIncomplete")}
          </p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </button>
  );
}
