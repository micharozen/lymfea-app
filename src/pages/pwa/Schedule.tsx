import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addMonths, subMonths, startOfMonth, format, endOfMonth } from "date-fns";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { MonthCalendar } from "@/components/pwa/schedule/MonthCalendar";
import { DayEditorDrawer } from "@/components/pwa/schedule/DayEditorDrawer";
import { WeeklyTemplateEditor } from "@/components/pwa/schedule/WeeklyTemplateEditor";
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

type Tab = "monthly" | "template";

export default function PwaSchedule() {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("monthly");

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

  // Load template
  useEffect(() => {
    if (!therapistId) return;

    const loadTemplate = async () => {
      const { data } = await supabase
        .from("therapist_schedule_templates")
        .select("weekly_pattern")
        .eq("therapist_id", therapistId)
        .single();

      if (data?.weekly_pattern) {
        setWeeklyPattern(data.weekly_pattern as DayPattern[]);
      }
    };

    loadTemplate();
  }, [therapistId]);

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
    setWeeklyPattern(pattern);
    setSavingTemplate(true);

    const { error } = await supabase
      .from("therapist_schedule_templates")
      .upsert({
        therapist_id: therapistId,
        weekly_pattern: pattern as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }, { onConflict: "therapist_id" });

    setSavingTemplate(false);

    if (error) {
      console.error("Error saving template:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.templateSaved"));
  }, [therapistId, t]);

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

    // Reload if we're looking at the applied month
    const appliedMonth = startOfMonth(new Date(year, month - 1));
    if (format(appliedMonth, "yyyy-MM") === format(currentMonth, "yyyy-MM")) {
      loadAvailability();
    }
  }, [therapistId, weeklyPattern, currentMonth, loadAvailability, t]);

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
  }, [therapistId, loadAvailability, t]);

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
        backPath="/pwa/profile"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        title={t("schedule.title")}
        showBack
        backPath="/pwa/profile"
      />

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "monthly" ? (
          <div>
            <MonthCalendar
              currentMonth={currentMonth}
              onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
              onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
              availability={availability}
              onDayPress={handleDayPress}
            />

            {/* Empty state */}
            {availability.length === 0 && !loading && (
              <div className="text-center mt-8 space-y-2">
                <p className="text-sm text-muted-foreground">{t("schedule.noScheduleYet")}</p>
                <p className="text-xs text-muted-foreground">{t("schedule.noScheduleDesc")}</p>
              </div>
            )}
          </div>
        ) : (
          <WeeklyTemplateEditor
            weeklyPattern={weeklyPattern}
            onChange={handleSaveTemplate}
            onApplyToMonth={handleApplyToMonth}
            saving={savingTemplate}
            applying={applyingTemplate}
          />
        )}
      </div>

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
