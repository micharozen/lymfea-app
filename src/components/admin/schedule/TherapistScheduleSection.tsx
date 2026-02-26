import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { MonthCalendar } from "@/components/pwa/schedule/MonthCalendar";
import { DayEditorDrawer } from "@/components/pwa/schedule/DayEditorDrawer";
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

interface TherapistScheduleSectionProps {
  therapistId: string;
}

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

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savingDay, setSavingDay] = useState(false);

  const loadAvailability = useCallback(async () => {
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data } = await supabase
      .from("therapist_availability")
      .select("date, is_available, shifts, is_manually_edited")
      .eq("therapist_id", therapistId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    setAvailability((data || []).map((d) => ({
      ...d,
      shifts: (d.shifts as Shift[]) || [],
    })));
  }, [therapistId, currentMonth]);

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
      <MonthCalendar
        currentMonth={currentMonth}
        onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
        onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
        availability={availability}
        onDayPress={handleDayPress}
        compact
        showLegend
        showTooltips
      />

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
                {isFr ? "total mois" : "month total"}
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
