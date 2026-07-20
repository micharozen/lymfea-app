import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Shift {
  start: string;
  end: string;
}

interface DayAvailability {
  date: string;
  is_available: boolean;
  shifts: Shift[];
  is_manually_edited: boolean;
}

interface Absence {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  note: string | null;
}

interface AvailabilityTimeGridProps {
  days: Date[];
  availability: DayAvailability[];
  absences: Absence[];
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onDayPress: (date: string) => void;
}

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 44;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function AvailabilityTimeGrid({
  days,
  availability,
  absences,
  onPrevious,
  onNext,
  onToday,
  onDayPress,
}: AvailabilityTimeGridProps) {
  const { i18n } = useTranslation();
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i),
    []
  );

  const availabilityMap = useMemo(() => {
    const map = new Map<string, DayAvailability>();
    availability.forEach((day) => map.set(day.date, day));
    return map;
  }, [availability]);

  const absenceDates = useMemo(() => {
    const dates = new Set<string>();
    absences.forEach((absence) => {
      const current = new Date(absence.start_date + "T00:00:00");
      const end = new Date(absence.end_date + "T00:00:00");
      while (current <= end) {
        dates.add(format(current, "yyyy-MM-dd"));
        current.setDate(current.getDate() + 1);
      }
    });
    return dates;
  }, [absences]);

  const today = startOfDay(new Date());
  const gridHeight = hours.length * HOUR_HEIGHT;

  const rangeLabel = useMemo(() => {
    if (days.length === 0) return "";
    if (days.length === 1) return format(days[0], "EEEE d MMMM yyyy", { locale });
    return `${format(days[0], "d MMM", { locale })} – ${format(days[days.length - 1], "d MMM yyyy", { locale })}`;
  }, [days, locale]);

  return (
    <div>
      {/* Range navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevious} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold capitalize">{rangeLabel}</h2>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onToday}>
            {isFr ? "Aujourd'hui" : "Today"}
          </Button>
        </div>
        <button onClick={onNext} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b bg-muted/30">
          <div className="w-12 shrink-0" />
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            return (
              <div
                key={dateStr}
                className={cn(
                  "flex-1 min-w-0 border-l py-1.5 text-center",
                  isToday(day) && "bg-primary/10"
                )}
              >
                <p className="text-[10px] text-muted-foreground capitalize truncate">
                  {format(day, "EEE", { locale })}
                </p>
                <p className={cn("text-sm font-semibold", isToday(day) && "text-primary")}>
                  {format(day, "d")}
                </p>
              </div>
            );
          })}
        </div>

        {/* Hour grid */}
        <div className="flex" style={{ height: gridHeight }}>
          {/* Hour gutter */}
          <div className="w-12 shrink-0">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative text-[10px] text-muted-foreground text-right pr-1.5"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-1.5 right-1.5">{hour}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayData = availabilityMap.get(dateStr);
            const isAbsence = absenceDates.has(dateStr);
            const isPast = isBefore(day, today);
            const shifts = dayData?.is_available ? dayData.shifts : [];

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => !isPast && onDayPress(dateStr)}
                disabled={isPast}
                className={cn(
                  "relative flex-1 min-w-0 border-l text-left",
                  isPast && "opacity-50 cursor-default",
                  !isPast && "hover:bg-muted/40 transition-colors"
                )}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border/50"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Absence overlay */}
                {isAbsence && (
                  <div className="absolute inset-0 bg-red-400/15 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-red-500 rotate-[-90deg] whitespace-nowrap">
                      {isFr ? "Bloqué" : "Blocked"}
                    </span>
                  </div>
                )}

                {/* Availability blocks */}
                {!isAbsence &&
                  shifts.map((shift, index) => {
                    const top =
                      ((timeToMinutes(shift.start) - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height =
                      ((timeToMinutes(shift.end) - timeToMinutes(shift.start)) / 60) * HOUR_HEIGHT;
                    if (height <= 0) return null;
                    return (
                      <div
                        key={index}
                        className={cn(
                          "absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 overflow-hidden",
                          dayData?.is_manually_edited
                            ? "bg-amber-500/20 border border-amber-500/50"
                            : "bg-emerald-500/20 border border-emerald-500/50"
                        )}
                        style={{ top, height }}
                      >
                        <p className="text-[10px] font-medium leading-tight truncate">
                          {shift.start} – {shift.end}
                        </p>
                      </div>
                    );
                  })}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
