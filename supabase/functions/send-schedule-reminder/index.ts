import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const HORIZON_DAYS = 14;

interface DayPattern {
  enabled?: boolean;
  shifts?: { start: string; end: string }[];
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function hasEnabledTemplate(pattern: DayPattern[] | null | undefined): boolean {
  if (!pattern || !Array.isArray(pattern)) return false;
  return pattern.some((day) => day.enabled && (day.shifts?.length ?? 0) > 0);
}

function isDeclaredAvailableDay(row: {
  is_available: boolean;
  shifts: unknown;
}): boolean {
  if (!row.is_available) return false;
  const shifts = Array.isArray(row.shifts) ? row.shifts : [];
  return shifts.length > 0;
}

function isScheduleIncomplete(
  weeklyPattern: DayPattern[] | null | undefined,
  availabilityRows: { is_available: boolean; shifts: unknown }[]
): boolean {
  const hasTemplate = hasEnabledTemplate(weeklyPattern ?? undefined);
  const declaredDaysCount = availabilityRows.filter(isDeclaredAvailableDay).length;

  if (!hasTemplate) return true;
  if (declaredDaysCount === 0) return true;
  if (declaredDaysCount < HORIZON_DAYS) return true;
  return false;
}

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let reminderType: "weekly" | "monthly" = "weekly";
    try {
      const body = await req.json();
      if (body?.reminderType === "monthly" || body?.reminderType === "weekly") {
        reminderType = body.reminderType;
      }
    } catch {
      // empty body is fine for cron
    }

    const now = new Date();
    const targetPeriod =
      reminderType === "monthly"
        ? formatMonth(addMonths(now, 1))
        : formatDate(now);

    console.log(
      `[CRON] send-schedule-reminder type=${reminderType} period=${targetPeriod}`
    );

    const { data: venueLinks, error: venueError } = await supabase
      .from("therapist_venues")
      .select("therapist_id");

    if (venueError) throw venueError;

    const therapistIds = [
      ...new Set((venueLinks ?? []).map((row) => row.therapist_id)),
    ];

    if (therapistIds.length === 0) {
      return new Response(JSON.stringify({ message: "No affiliated therapists" }), {
        status: 200,
      });
    }

    const { data: therapists, error: therapistsError } = await supabase
      .from("therapists")
      .select("id, user_id, first_name, status")
      .in("id", therapistIds)
      .not("user_id", "is", null);

    if (therapistsError) throw therapistsError;
    if (!therapists || therapists.length === 0) {
      return new Response(JSON.stringify({ message: "No therapists found" }), {
        status: 200,
      });
    }

    const activeTherapists = therapists.filter((row) => {
      const status = (row.status ?? "").toLowerCase();
      return status === "active" || status === "actif";
    });

    const startDate = formatDate(now);
    const endDate = formatDate(addDays(now, HORIZON_DAYS - 1));
    let sent = 0;
    let skipped = 0;

    for (const therapist of activeTherapists) {
      if (!therapist.user_id) continue;

      const { data: existingLog } = await supabase
        .from("schedule_reminder_logs")
        .select("id")
        .eq("therapist_id", therapist.id)
        .eq("reminder_type", reminderType)
        .eq("target_month", targetPeriod)
        .maybeSingle();

      if (existingLog) {
        skipped++;
        continue;
      }

      const [templateResult, availabilityResult] = await Promise.all([
        supabase
          .from("therapist_schedule_templates")
          .select("weekly_pattern")
          .eq("therapist_id", therapist.id)
          .maybeSingle(),
        supabase
          .from("therapist_availability")
          .select("is_available, shifts")
          .eq("therapist_id", therapist.id)
          .gte("date", startDate)
          .lte("date", endDate),
      ]);

      const weeklyPattern = templateResult.data?.weekly_pattern as
        | DayPattern[]
        | undefined;
      const availabilityRows = availabilityResult.data ?? [];

      if (!isScheduleIncomplete(weeklyPattern, availabilityRows)) {
        skipped++;
        continue;
      }

      const monthLabel =
        reminderType === "monthly"
          ? new Date(`${targetPeriod}-01T12:00:00Z`).toLocaleDateString("fr-FR", {
              month: "long",
              year: "numeric",
            })
          : null;

      const title = "📅 Planning à mettre à jour";
      const body =
        reminderType === "monthly" && monthLabel
          ? `Pensez à déclarer vos disponibilités pour ${monthLabel}.`
          : "Pensez à mettre à jour vos disponibilités pour les prochaines semaines.";

      const { error: logError } = await supabase.from("schedule_reminder_logs").insert({
        therapist_id: therapist.id,
        reminder_type: reminderType,
        target_month: targetPeriod,
      });

      if (logError) {
        console.error(`Dedup insert failed for ${therapist.id}:`, logError);
        continue;
      }

      const { error: pushError } = await supabase.functions.invoke(
        "send-push-notification",
        {
          body: {
            userId: therapist.user_id,
            title,
            body,
            data: { url: "/pwa/schedule" },
          },
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        }
      );

      if (pushError) {
        console.error(`Push failed for therapist ${therapist.id}:`, pushError);
        await supabase
          .from("schedule_reminder_logs")
          .delete()
          .eq("therapist_id", therapist.id)
          .eq("reminder_type", reminderType)
          .eq("target_month", targetPeriod);
        continue;
      }

      sent++;
      console.log(`✅ Schedule reminder sent to ${therapist.first_name ?? therapist.id}`);
    }

    return new Response(
      JSON.stringify({
        reminderType,
        targetPeriod,
        sent,
        skipped,
        checked: activeTherapists.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CRON] send-schedule-reminder error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
