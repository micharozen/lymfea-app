import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, addDays, startOfDay, startOfWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { MonthCalendar } from "@/components/pwa/schedule/MonthCalendar";
import { DayEditorDrawer } from "@/components/pwa/schedule/DayEditorDrawer";
import { AvailabilityTimeGrid } from "./AvailabilityTimeGrid";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CalendarCheck, Clock, TrendingUp } from "lucide-react";

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

interface TherapistScheduleSectionProps {
  therapistId: string;
}

type ViewMode = 1 | 3 | 7 | "month";

const VIEW_STORAGE_KEY = "therapist-schedule-view";

const VIEW_OPTIONS: { mode: ViewMode; fr: string; en: string }[] = [
  { mode: 1, fr: "1J", en: "1D" },
  { mode: 3, fr: "3J", en: "3D" },
  { mode: 7, fr: "7J", en: "7D" },
  { mode: "month", fr: "Mois", en: "Month" },
];

function shiftDurationMinutes(shift: Shift): number {
  const [sh, sm] = shift.start.split(":").map(Number);
  const [eh, em] = shift.end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function TherapistScheduleSection({ therapistId }: TherapistScheduleSectionProps) {
  const { i18n } = useTranslation();
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "1" || saved === "3" || saved === "7" ? (Number(saved) as ViewMode) : "month";
  });
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savingDay, setSavingDay] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, String(viewMode));
  }, [viewMode]);

  // Days shown by the time grid — the 7-day view snaps to the ISO week.
  const gridDays = useMemo(() => {
    if (viewMode === "month") return [];
    const start = viewMode === 7 ? startOfWeek(anchorDate, { weekStartsOn: 1 }) : anchorDate;
    return Array.from({ length: viewMode }, (_, i) => addDays(start, i));
  }, [viewMode, anchorDate]);

  const [rangeStart, rangeEnd] = useMemo(() => {
    if (viewMode === "month") {
      return [
        format(startOfMonth(currentMonth), "yyyy-MM-dd"),
        format(endOfMonth(currentMonth), "yyyy-MM-dd"),
      ];
    }
    return [
      format(gridDays[0], "yyyy-MM-dd"),
      format(gridDays[gridDays.length - 1], "yyyy-MM-dd"),
    ];
  }, [viewMode, currentMonth, gridDays]);

  const loadAvailability = useCallback(async () => {
    const monthStart = rangeStart;
    const monthEnd = rangeEnd;

    const [availabilityResult, absencesResult] = await Promise.all([
      supabase
        .from("therapist_availability")
        .select("date, is_available, shifts, is_manually_edited")
        .eq("therapist_id", therapistId)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      supabase
        .from("therapist_absences")
        .select("id, start_date, end_date, reason, note")
        .eq("therapist_id", therapistId)
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
    ]);

    setAvailability((availabilityResult.data || []).map((d) => ({
      ...d,
      shifts: (d.shifts as Shift[]) || [],
    })));
    setAbsences(absencesResult.data ?? []);
  }, [therapistId, rangeStart, rangeEnd]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const handleSaveDay = useCallback(async (date: string, isAvailable: boolean, shifts: Shift[]) => {
    setSavingDay(true);

    const { error } = await supabase
      .from("therapist_availability")
      .upsert({
        therapist_id: therapistId,
        date,
        is_available: isAvailable,
        shifts: shifts as unknown as Record<string, unknown>,
        is_manually_edited: true,
        last_change_source: 'admin',
        updated_at: new Date().toISOString(),
      }, { onConflict: "therapist_id,date" });

    setSavingDay(false);

    if (error) {
      toast.error(isFr ? "Erreur lors de la sauvegarde" : "Error saving");
      return;
    }

    toast.success(isFr ? "Jour mis à jour" : "Day updated");
    setDrawerOpen(false);
    loadAvailability();
  }, [therapistId, loadAvailability, isFr]);

  const handleDayPress = (date: string) => {
    setSelectedDate(date);
    setDrawerOpen(true);
  };

  const selectedDayData = availability.find((d) => d.date === selectedDate);

  // Compute summary stats
  const stats = useMemo(() => {
    const availableDays = availability.filter(
      (d) => d.is_available && d.shifts.length > 0
    );

    const daysWithAvailability = availableDays.length;

    // Find longest day (most available hours)
    let longestDay: { date: string; minutes: number } | null = null;
    for (const day of availableDays) {
      const totalMinutes = day.shifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0);
      if (!longestDay || totalMinutes > longestDay.minutes) {
        longestDay = { date: day.date, minutes: totalMinutes };
      }
    }

    // Total hours in the month
    const totalMinutes = availableDays.reduce(
      (sum, day) => sum + day.shifts.reduce((s, shift) => s + shiftDurationMinutes(shift), 0),
      0
    );

    return { daysWithAvailability, longestDay, totalMinutes };
  }, [availability]);

  return (
    <div>
      {/* View selector — mirrors the global planning (BookingFilters) */}
      <div className="flex justify-end mb-3">
        <ButtonGroup>
          {VIEW_OPTIONS.map((opt) => (
            <Button
              key={String(opt.mode)}
              variant="outline"
              size="sm"
              onClick={() => setViewMode(opt.mode)}
              className={cn(
                "h-8 px-2.5 text-xs",
                viewMode === opt.mode
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground"
              )}
            >
              {isFr ? opt.fr : opt.en}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      {viewMode === "month" ? (
        <MonthCalendar
          currentMonth={currentMonth}
          onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
          onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
          availability={availability}
          absences={absences}
          onDayPress={handleDayPress}
          compact
          showLegend
          showTooltips
        />
      ) : (
        <AvailabilityTimeGrid
          days={gridDays}
          availability={availability}
          absences={absences}
          onPrevious={() => setAnchorDate(addDays(anchorDate, -viewMode))}
          onNext={() => setAnchorDate(addDays(anchorDate, viewMode))}
          onToday={() => setAnchorDate(startOfDay(new Date()))}
          onDayPress={handleDayPress}
        />
      )}

      {availability.length === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          {isFr ? "Aucun planning défini" : "No schedule defined"}
        </p>
      )}

      {/* Summary stats */}
      {availability.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-lg border p-2.5">
            <CalendarCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">{stats.daysWithAvailability}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isFr ? "jours dispo" : "days available"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-2.5">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">
                {formatDuration(stats.totalMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {viewMode === "month"
                  ? (isFr ? "total mois" : "month total")
                  : (isFr ? "total période" : "period total")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-2.5">
            <TrendingUp className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              {stats.longestDay ? (
                <>
                  <p className="text-lg font-semibold leading-none">
                    {formatDuration(stats.longestDay.minutes)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 capitalize truncate">
                    {format(new Date(stats.longestDay.date + "T00:00:00"), "EEEE", { locale })}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </div>
      )}

      <DayEditorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        date={selectedDate}
        isAvailable={selectedDayData?.is_available ?? false}
        shifts={selectedDayData?.shifts ?? []}
        onSave={handleSaveDay}
        saving={savingDay}
      />
    </div>
  );
}
