import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

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
  expectedDaysCount: number;
  horizonDays: number;
  hasTemplate: boolean;
  nextMonthLabel: string;
  weeklyPattern: DayPattern[] | null;
}

interface ScheduleCompletenessRpc {
  status: ScheduleCompletenessStatus;
  is_incomplete: boolean;
  declared_days_count: number;
  expected_days_count: number;
  horizon_days: number;
  has_template: boolean;
  weekly_pattern: DayPattern[] | null;
}

async function fetchScheduleCompleteness(
  therapistId: string
): Promise<ScheduleCompleteness> {
  const today = new Date();
  const locale = i18n.language?.startsWith("en") ? enUS : fr;
  const nextMonthLabel = format(addMonths(startOfMonth(today), 1), "MMMM yyyy", {
    locale,
  });

  const { data, error } = await supabase.rpc("get_schedule_completeness", {
    p_therapist_id: therapistId,
  });

  if (error) throw error;

  const row = data as ScheduleCompletenessRpc;

  return {
    isIncomplete: row.is_incomplete,
    status: row.status,
    declaredDaysCount: row.declared_days_count,
    expectedDaysCount: row.expected_days_count,
    horizonDays: row.horizon_days,
    hasTemplate: row.has_template,
    nextMonthLabel,
    weeklyPattern: row.weekly_pattern,
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
