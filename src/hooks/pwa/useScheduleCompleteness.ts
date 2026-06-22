import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfMonth, addMonths } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

const HORIZON_DAYS = 14;

interface DayPattern {
  enabled: boolean;
  shifts: { start: string; end: string }[];
}

export type ScheduleCompletenessStatus =
  | "no_template"
  | "template_not_applied"
  | "partial"
  | "complete";

export interface ScheduleCompleteness {
  isIncomplete: boolean;
  status: ScheduleCompletenessStatus;
  declaredDaysCount: number;
  horizonDays: number;
  hasTemplate: boolean;
  nextMonthLabel: string;
}

function hasEnabledTemplate(pattern: DayPattern[] | null | undefined): boolean {
  if (!pattern || !Array.isArray(pattern)) return false;
  return pattern.some((day) => day.enabled && day.shifts.length > 0);
}

function isDeclaredAvailableDay(row: {
  is_available: boolean;
  shifts: unknown;
}): boolean {
  if (!row.is_available) return false;
  const shifts = Array.isArray(row.shifts) ? row.shifts : [];
  return shifts.length > 0;
}

async function fetchScheduleCompleteness(
  therapistId: string
): Promise<ScheduleCompleteness> {
  const today = new Date();
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);
  const startDate = format(today, "yyyy-MM-dd");
  const endDate = format(horizonEnd, "yyyy-MM-dd");

  const locale = i18n.language?.startsWith("en") ? enUS : fr;
  const nextMonthLabel = format(addMonths(startOfMonth(today), 1), "MMMM yyyy", {
    locale,
  });

  const [templateResult, availabilityResult] = await Promise.all([
    supabase
      .from("therapist_schedule_templates")
      .select("weekly_pattern")
      .eq("therapist_id", therapistId)
      .maybeSingle(),
    supabase
      .from("therapist_availability")
      .select("date, is_available, shifts")
      .eq("therapist_id", therapistId)
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  const weeklyPattern = templateResult.data?.weekly_pattern as
    | DayPattern[]
    | undefined;
  const hasTemplate = hasEnabledTemplate(weeklyPattern);

  const declaredDaysCount = (availabilityResult.data ?? []).filter(
    isDeclaredAvailableDay
  ).length;

  let status: ScheduleCompletenessStatus;
  if (!hasTemplate) {
    status = "no_template";
  } else if (declaredDaysCount === 0) {
    status = "template_not_applied";
  } else if (declaredDaysCount < HORIZON_DAYS) {
    status = "partial";
  } else {
    status = "complete";
  }

  const isIncomplete =
    status === "no_template" ||
    status === "template_not_applied" ||
    status === "partial";

  return {
    isIncomplete,
    status,
    declaredDaysCount,
    horizonDays: HORIZON_DAYS,
    hasTemplate,
    nextMonthLabel,
  };
}

export function useScheduleCompleteness(therapistId: string | null | undefined) {
  return useQuery({
    queryKey: ["scheduleCompleteness", therapistId],
    queryFn: () => fetchScheduleCompleteness(therapistId!),
    enabled: !!therapistId,
    staleTime: 30_000,
  });
}

export async function fetchTherapistUnavailableDates(
  therapistId: string,
  dates: string[]
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();

  const uniqueDates = [...new Set(dates)];
  const { data } = await supabase
    .from("therapist_availability")
    .select("date")
    .eq("therapist_id", therapistId)
    .eq("is_available", false)
    .in("date", uniqueDates);

  return new Set((data ?? []).map((row) => row.date));
}
