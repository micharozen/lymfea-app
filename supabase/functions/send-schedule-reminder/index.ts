import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const REMINDER_TYPE = "biweekly";
const DEDUP_DAYS = 14;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOfWeek(d: Date): Date {
  const result = new Date(d);
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    const targetPeriod = formatDate(mondayOfWeek(now));

    console.log(
      `[CRON] send-schedule-reminder type=${REMINDER_TYPE} period=${targetPeriod}`
    );

    const { data: incompleteIds, error: incompleteError } = await supabase.rpc(
      "get_incomplete_schedule_therapist_ids",
      {
        p_dedup_days: DEDUP_DAYS,
        p_reminder_type: REMINDER_TYPE,
      }
    );

    if (incompleteError) throw incompleteError;

    const therapistIds = (incompleteIds ?? []) as string[];

    if (therapistIds.length === 0) {
      return new Response(
        JSON.stringify({
          reminderType: REMINDER_TYPE,
          targetPeriod,
          sent: 0,
          skipped: 0,
          checked: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: therapists, error: therapistsError } = await supabase
      .from("therapists")
      .select("id, user_id, first_name")
      .in("id", therapistIds)
      .not("user_id", "is", null);

    if (therapistsError) throw therapistsError;

    const skipPush =
      Deno.env.get("IS_LOCAL") === "true" ||
      !Deno.env.get("ONESIGNAL_APP_ID");

    let sent = 0;
    let skipped = 0;

    for (const therapist of therapists ?? []) {
      if (!therapist.user_id) {
        skipped++;
        continue;
      }

      const title = "📅 Planning à mettre à jour";
      const body =
        "Pensez à mettre à jour vos disponibilités pour les 2 prochaines semaines.";

      const { error: logError } = await supabase.from("schedule_reminder_logs").insert({
        therapist_id: therapist.id,
        reminder_type: REMINDER_TYPE,
        target_month: targetPeriod,
      });

      if (logError) {
        console.error(`Dedup insert failed for ${therapist.id}:`, logError);
        skipped++;
        continue;
      }

      if (skipPush) {
        sent++;
        console.log(
          `[LOCAL] Schedule reminder logged (push skipped) for ${therapist.first_name ?? therapist.id}`
        );
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
          .eq("reminder_type", REMINDER_TYPE)
          .eq("target_month", targetPeriod);
        skipped++;
        continue;
      }

      sent++;
      console.log(`✅ Schedule reminder sent to ${therapist.first_name ?? therapist.id}`);
    }

    return new Response(
      JSON.stringify({
        reminderType: REMINDER_TYPE,
        targetPeriod,
        sent,
        skipped,
        checked: therapistIds.length,
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
