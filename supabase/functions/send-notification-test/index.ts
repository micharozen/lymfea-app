import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendNotificationTestRequest {
  scope: "self" | "venue";
  hotelId?: string;
}

interface TargetTherapist {
  id: string;
  user_id: string | null;
}

const TEST_URL = "/pwa/notification-test";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Caller authentication ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized - No auth header" }, 401);
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (userError || !callerId) {
      return json({ error: "Unauthorized - Invalid session" }, 401);
    }

    const { scope, hotelId }: SendNotificationTestRequest = await req.json();

    // ---- Resolve targets ----
    let targets: TargetTherapist[] = [];

    if (scope === "self") {
      const { data, error } = await admin
        .from("therapists")
        .select("id, user_id")
        .eq("user_id", callerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "No therapist profile for this user" }, 404);
      targets = [data];
    } else if (scope === "venue") {
      if (!hotelId) return json({ error: "hotelId is required for scope 'venue'" }, 400);

      const { data: roles, error: roleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .in("role", ["admin", "concierge"]);
      if (roleError) throw roleError;
      if (!roles || roles.length === 0) {
        return json({ error: "Forbidden - Admin or concierge access required" }, 403);
      }

      const { data: links, error: linkError } = await admin
        .from("therapist_venues")
        .select("therapist_id")
        .eq("hotel_id", hotelId);
      if (linkError) throw linkError;

      const therapistIds = (links ?? []).map((row) => row.therapist_id);
      if (therapistIds.length > 0) {
        const { data, error } = await admin
          .from("therapists")
          .select("id, user_id")
          .in("id", therapistIds);
        if (error) throw error;
        targets = data ?? [];
      }
    } else {
      return json({ error: "Invalid scope" }, 400);
    }

    if (targets.length === 0) {
      return json({ success: true, sent: 0, undelivered: 0 });
    }

    // ---- Send ----
    let sent = 0;
    let undelivered = 0;

    const markUndelivered = async (therapistId: string, reason: string) => {
      undelivered += 1;
      await admin
        .from("therapists")
        .update({
          notification_test_sent_at: new Date().toISOString(),
          notification_test_status: "undelivered",
          notification_test_error: reason.slice(0, 500),
        })
        .eq("id", therapistId);
    };

    for (const therapist of targets) {
      if (!therapist.user_id) {
        await markUndelivered(therapist.id, "no_account");
        continue;
      }

      const { error: resetError } = await admin
        .from("therapists")
        .update({
          notification_test_sent_at: new Date().toISOString(),
          notification_test_status: "pending",
          notification_test_error: null,
        })
        .eq("id", therapist.id);
      if (resetError) throw resetError;

      const { data: pushData, error: pushError } = await admin.functions.invoke(
        "send-push-notification",
        {
          headers: { Authorization: `Bearer ${serviceRoleKey}` },
          body: {
            userId: therapist.user_id,
            title: "Notification test",
            titleFr: "Notification de test",
            body: "Tap to confirm you received this notification",
            bodyFr: "Touchez cette notification pour confirmer sa réception",
            data: { url: TEST_URL },
          },
        },
      );

      // OneSignal answers 400 (unknown external_id) or 200 with recipients: 0
      // when the therapist has no subscribed device. There is no way to know
      // beforehand: no subscription state is persisted server-side.
      const result = (pushData as { result?: Record<string, unknown> } | null)?.result;
      const recipients = Number(result?.recipients ?? 0);
      const delivered = !pushError && Boolean(result?.id) && recipients > 0 && !result?.errors;

      if (delivered) {
        sent += 1;
      } else {
        const reason = pushError?.message
          ?? JSON.stringify(result?.errors ?? result ?? pushData ?? "unknown");
        console.error(`[notification-test] Not delivered to ${therapist.id}: ${reason}`);
        await markUndelivered(therapist.id, reason);
      }
    }

    return json({ success: true, sent, undelivered });
  } catch (error) {
    console.error("[notification-test] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
