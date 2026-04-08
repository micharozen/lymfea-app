import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, isBefore, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DayAvailability {
  date: string;
  is_available: boolean;
  shifts: { start: string; end: string }[];
  is_manually_edited: boolean;
}

interface MonthCalendarProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  availability: DayAvailability[];
  onDayPress: (date: string) => void;
  compact?: boolean;
  showLegend?: boolean;
  showTooltips?: boolean;
}

export function MonthCalendar({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  availability,
  onDayPress,
  compact = false,
  showLegend,
  showTooltips = false,
}: MonthCalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;
  const isFr = i18n.language === "fr";

  // Show legend by default when not compact, or when explicitly requested
  const legendVisible = showLegend ?? !compact;

  const availabilityMap = useMemo(() => {
    const map = new Map<string, DayAvailability>();
    availability.forEach((day) => map.set(day.date, day));
    return map;
  }, [availability]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i);
      days.push(format(d, "EEE", { locale }).charAt(0).toUpperCase() + format(d, "EEE", { locale }).slice(1, 3));
    }
    return days;
  }, [locale]);

  const today = startOfDay(new Date());

  const renderDayButton = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const inMonth = isSameMonth(day, currentMonth);
    const isPast = isBefore(day, today);
    const dayData = availabilityMap.get(dateStr);
    const isAvailable = dayData?.is_available === true && (dayData?.shifts?.length ?? 0) > 0;
    const isManual = dayData?.is_manually_edited === true;
    const isUnavailable = dayData?.is_available === false;
    const hasNoData = !dayData;

    const button = (
      <button
        key={dateStr}
        onClick={() => !isPast && inMonth && onDayPress(dateStr)}
        disabled={isPast || !inMonth}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg transition-colors",
          compact ? "h-8 w-full" : "h-11 w-full",
          !inMonth && "opacity-30",
          isPast && inMonth && "opacity-50",
          !isPast && inMonth && "hover:bg-muted active:scale-95",
          isToday(day) && "ring-1 ring-primary"
        )}
      >
        <span className={cn("text-sm", compact && "text-xs")}>
          {format(day, "d")}
        </span>

        {/* Status dot */}
        {inMonth && !hasNoData && (
          <div
            className={cn(
              "absolute bottom-0.5 w-1.5 h-1.5 rounded-full",
              isAvailable && !isManual && "bg-emerald-500",
              isAvailable && isManual && "bg-amber-500",
              isUnavailable && "bg-muted-foreground/40"
            )}
          />
        )}
      </button>
    );

    // Show tooltip with shift details on hover (admin mode)
    if (showTooltips && inMonth && dayData) {
      const dayLabel = format(day, "EEEE d", { locale });
      return (
        <Tooltip key={dateStr}>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="font-medium capitalize">{dayLabel}</p>
            {isAvailable && dayData.shifts.length > 0 ? (
              <div className="mt-1 space-y-0.5">
                {dayData.shifts.map((s, i) => (
                  <p key={i} className="text-muted-foreground">{s.start} – {s.end}</p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-0.5">
                {isFr ? "Indisponible" : "Unavailable"}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale })}
        </h2>
        <button onClick={onNextMonth} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => renderDayButton(day))}
      </div>

      {/* Legend */}
      {legendVisible && (
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">{isFr ? "Dispo" : "Available"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-muted-foreground">{isFr ? "Modifié" : "Modified"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">{isFr ? "Indispo" : "Unavailable"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
