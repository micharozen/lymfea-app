import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addMonths, subMonths, startOfMonth, format, endOfMonth, addDays } from "date-fns";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { MonthCalendar } from "@/components/pwa/schedule/MonthCalendar";
import { DayEditorDrawer } from "@/components/pwa/schedule/DayEditorDrawer";
import { WeeklyTemplateEditor } from "@/components/pwa/schedule/WeeklyTemplateEditor";
import { AbsencesList } from "@/components/pwa/schedule/AbsencesList";
import { ScheduleActionBanner } from "@/components/pwa/schedule/ScheduleActionBanner";
import { useScheduleCompleteness } from "@/hooks/pwa/useScheduleCompleteness";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Shift {
  start: string;
  end: string;
}

interface DayPattern {
  enabled: boolean;
  shifts: Shift[];
}

interface DayAvailability {
  date: string;
  is_available: boolean;
  shifts: Shift[];
  is_manually_edited: boolean;
}

const DEFAULT_PATTERN: DayPattern[] = Array.from({ length: 7 }, () => ({
  enabled: false,
  shifts: [],
}));

interface Absence {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  note: string | null;
}

type Tab = "monthly" | "template" | "absences";

export default function PwaSchedule() {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("monthly");
  const [defaultTabSet, setDefaultTabSet] = useState(false);

  const { data: scheduleCompleteness } = useScheduleCompleteness(therapistId);

  const invalidateCompleteness = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scheduleCompleteness", therapistId] });
  }, [queryClient, therapistId]);

  // Monthly view state
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [availability, setAvailability] = useState<DayAvailability[]>([]);

  // Day editor state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savingDay, setSavingDay] = useState(false);

  // Template state
  const [weeklyPattern, setWeeklyPattern] = useState<DayPattern[]>(DEFAULT_PATTERN);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  // Absences state
  const [absences, setAbsences] = useState<Absence[]>([]);

  // Load therapist ID
  useEffect(() => {
    const loadTherapist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/pwa/login");
        return;
      }

      const { data, error } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        toast.error(t("common:errors.generic"));
        navigate("/pwa/dashboard");
        return;
      }

      setTherapistId(data.id);
    };

    loadTherapist();
  }, [navigate, t]);

  useEffect(() => {
    if (!scheduleCompleteness?.weeklyPattern) return;
    setWeeklyPattern(scheduleCompleteness.weeklyPattern);
  }, [scheduleCompleteness?.weeklyPattern]);

  // Load absences
  const loadAbsences = useCallback(async () => {
    if (!therapistId) return;

    const { data, error } = await supabase
      .from("therapist_absences")
      .select("id, start_date, end_date, reason, note")
      .eq("therapist_id", therapistId)
      .order("start_date", { ascending: false });

    if (error) {
      console.error("Error loading absences:", error);
      return;
    }

    setAbsences((data || []) as Absence[]);
  }, [therapistId]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  useEffect(() => {
    if (!scheduleCompleteness || defaultTabSet) return;
    if (scheduleCompleteness.status === "no_template") {
      setActiveTab("template");
    }
    setDefaultTabSet(true);
  }, [scheduleCompleteness, defaultTabSet]);

  // Load availability for current month
  const loadAvailability = useCallback(async () => {
    if (!therapistId) return;

    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("therapist_availability")
      .select("date, is_available, shifts, is_manually_edited")
      .eq("therapist_id", therapistId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (error) {
      console.error("Error loading availability:", error);
      return;
    }

    setAvailability((data || []).map((d) => ({
      ...d,
      shifts: (d.shifts as Shift[]) || [],
    })));
    setLoading(false);
  }, [therapistId, currentMonth]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Save template
  const handleSaveTemplate = useCallback(async (pattern: DayPattern[]) => {
    if (!therapistId) return;
    const normalizedPattern = pattern.map((day) => ({
      ...day,
      shifts: day.enabled ? day.shifts : [],
    }));
    setWeeklyPattern(normalizedPattern);
    setSavingTemplate(true);

    const { error } = await supabase
      .from("therapist_schedule_templates")
      .upsert({
        therapist_id: therapistId,
        weekly_pattern: normalizedPattern as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }, { onConflict: "therapist_id" });

    setSavingTemplate(false);

    if (error) {
      console.error("Error saving template:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.templateSaved"));
    invalidateCompleteness();
  }, [therapistId, t, invalidateCompleteness]);

  // Apply template to month
  const handleApplyToMonth = useCallback(async (year: number, month: number) => {
    if (!therapistId) return;
    setApplyingTemplate(true);

    const { data, error } = await supabase.rpc("apply_schedule_template", {
      _therapist_id: therapistId,
      _year: year,
      _month: month,
      _weekly_pattern: weeklyPattern as unknown as Record<string, unknown>,
      _overwrite_manual: false,
    });

    setApplyingTemplate(false);

    if (error) {
      console.error("Error applying template:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.applied", { count: data ?? 0 }));

    const appliedMonth = startOfMonth(new Date(year, month - 1));
    setCurrentMonth(appliedMonth);
    setActiveTab("monthly");
    invalidateCompleteness();
  }, [therapistId, weeklyPattern, t, invalidateCompleteness]);

  const handleApplyFromBanner = useCallback(async () => {
    const today = new Date();
    const current = startOfMonth(today);
    const horizonEnd = addDays(today, 13);

    await handleApplyToMonth(current.getFullYear(), current.getMonth() + 1);

    if (format(horizonEnd, "yyyy-MM") !== format(current, "yyyy-MM")) {
      const next = addMonths(current, 1);
      await handleApplyToMonth(next.getFullYear(), next.getMonth() + 1);
      setCurrentMonth(next);
    } else {
      setCurrentMonth(current);
    }

    setActiveTab("monthly");
  }, [handleApplyToMonth]);

  const handleCompletePartial = useCallback(async () => {
    const today = new Date();
    const current = startOfMonth(today);
    const horizonEnd = addDays(today, 13);

    await handleApplyToMonth(current.getFullYear(), current.getMonth() + 1);

    if (format(horizonEnd, "yyyy-MM") !== format(current, "yyyy-MM")) {
      const next = addMonths(current, 1);
      await handleApplyToMonth(next.getFullYear(), next.getMonth() + 1);
    }

    setCurrentMonth(current);
    setActiveTab("monthly");
    loadAvailability();
  }, [handleApplyToMonth, loadAvailability]);

  // Save a single day
  const handleSaveDay = useCallback(async (date: string, isAvailable: boolean, shifts: Shift[]) => {
    if (!therapistId) return;
    setSavingDay(true);

    const { error } = await supabase
      .from("therapist_availability")
      .upsert({
        therapist_id: therapistId,
        date,
        is_available: isAvailable,
        shifts: shifts as unknown as Record<string, unknown>,
        is_manually_edited: true,
        last_change_source: 'pwa',
        updated_at: new Date().toISOString(),
      }, { onConflict: "therapist_id,date" });

    setSavingDay(false);

    if (error) {
      console.error("Error saving day:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.daySaved"));
    setDrawerOpen(false);
    loadAvailability();
    invalidateCompleteness();
  }, [therapistId, loadAvailability, t, invalidateCompleteness]);

  // Open day editor
  const handleDayPress = (date: string) => {
    setSelectedDate(date);
    setDrawerOpen(true);
  };

  // Get selected day data
  const selectedDayData = availability.find((d) => d.date === selectedDate);

  if (loading && !therapistId) {
    return (
      <PwaPageLoader
        title={t("schedule.title")}
        showBack
        backPath="/pwa/bookings"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        title={t("schedule.title")}
        showBack
        backPath="/pwa/bookings"
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {scheduleCompleteness && (
          <ScheduleActionBanner
            completeness={scheduleCompleteness}
            onGoToTemplate={() => setActiveTab("template")}
            onGoToMonthly={() => setActiveTab("monthly")}
            onApplyTemplate={
              scheduleCompleteness.status === "template_not_applied"
                ? handleApplyFromBanner
                : undefined
            }
            onCompletePartial={
              scheduleCompleteness.status === "partial"
                ? handleCompletePartial
                : undefined
            }
            applyingTemplate={applyingTemplate}
            completingPartial={applyingTemplate}
          />
        )}

      {/* Tabs */}
      <div className="flex border-b border-border -mx-4 px-4 mb-4">
        <button
          onClick={() => setActiveTab("monthly")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center transition-colors relative",
            activeTab === "monthly" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {t("schedule.monthlyView")}
          {activeTab === "monthly" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("template")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center transition-colors relative",
            activeTab === "template" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {t("schedule.weeklyTemplate")}
          {activeTab === "template" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("absences")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center transition-colors relative",
            activeTab === "absences" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {t("schedule.absences")}
          {activeTab === "absences" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

        {activeTab === "monthly" ? (
          <div>
            <MonthCalendar
              currentMonth={currentMonth}
              onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
              onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
              availability={availability}
              onDayPress={handleDayPress}
              absences={absences}
            />

            {availability.length === 0 && !loading && scheduleCompleteness?.status === "complete" && (
              <div className="text-center mt-8 space-y-2">
                <p className="text-sm text-muted-foreground">{t("schedule.noScheduleYet")}</p>
                <p className="text-xs text-muted-foreground">{t("schedule.noScheduleDesc")}</p>
              </div>
            )}
          </div>
        ) : activeTab === "template" ? (
          <WeeklyTemplateEditor
            weeklyPattern={weeklyPattern}
            onChange={handleSaveTemplate}
            onApplyToMonth={handleApplyToMonth}
            saving={savingTemplate}
            applying={applyingTemplate}
          />
        ) : (
          therapistId && (
            <AbsencesList
              therapistId={therapistId}
              onAbsenceChanged={() => {
                loadAvailability();
                loadAbsences();
                invalidateCompleteness();
              }}
            />
          )
        )}
      </div>

      {scheduleCompleteness && scheduleCompleteness.status !== "complete" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
          <Button
            className="w-full shadow-lg"
            onClick={() => {
              if (scheduleCompleteness.status === "no_template") {
                setActiveTab("template");
              } else if (scheduleCompleteness.status === "template_not_applied") {
                void handleApplyFromBanner();
              } else if (scheduleCompleteness.status === "partial") {
                void handleCompletePartial();
              } else {
                setActiveTab("monthly");
              }
            }}
          >
            {t("schedule.actionBanner.updateAvailability")}
          </Button>
        </div>
      )}

      {/* Day editor drawer */}
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
