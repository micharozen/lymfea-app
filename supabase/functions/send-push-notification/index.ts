import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { brand } from "../_shared/brand.ts";
import { oneSignalApps, type OneSignalApp } from "../_shared/onesignalApps.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeliveryLog {
  user_id: string;
  booking_id: string | null;
  notification_type: string | null;
  status: string;
  onesignal_notification_id: string | null;
  error: string | null;
}

/**
 * Journalise le statut réel de l'envoi. Best-effort : un échec d'écriture ne doit
 * jamais faire échouer une notification qui, elle, est bien partie.
 */
async function logDelivery(entry: DeliveryLog): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.from("push_delivery_logs").insert(entry);
    if (error) console.error("[OneSignal] Delivery log insert failed:", error.message);
  } catch (e) {
    console.error("[OneSignal] Delivery log exception:", e);
  }
}

interface PushMessage {
  userId: string;
  title?: string;
  body?: string;
  titleFr?: string;
  bodyFr?: string;
  data?: Record<string, any>;
}

interface AppAttempt {
  label: string;
  ok: boolean;
  status: number;
  delivered: boolean;
  notificationId: string;
  result: any;
}

async function sendThroughApp(app: OneSignalApp, msg: PushMessage): Promise<AppAttempt> {
  const { userId, title, body, titleFr, bodyFr, data } = msg;

  // Lien de clic sur le domaine de cette app : c'est là qu'est installée la PWA
  // abonnée, un autre domaine ouvrirait Safari.
  const clickUrl = data?.url ? `${app.siteUrl}${data.url}` : app.siteUrl;
  console.log(`[OneSignal:${app.label}] Click URL:`, clickUrl);

  const notificationPayload = {
    app_id: app.appId,
    headings: {
      en: title || brand.name,
      fr: titleFr || title || brand.name,
    },
    contents: {
      en: body || "New notification",
      fr: bodyFr || body || "Nouvelle notification",
    },
    // Primary URL for notification click (OneSignal REST API uses 'url')
    url: clickUrl,
    // Include URL in data as backup for SDK click handler
    data: { ...data, launchUrl: clickUrl, url: clickUrl },
    // Target by external user ID (the Supabase user_id)
    include_aliases: {
      external_id: [userId]
    },
    target_channel: "push",
    // Explicit short collapse_id
    collapse_id: data?.bookingId ? `b-${data.bookingId.substring(0, 8)}` : `n-${Date.now()}`
  };

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${app.restApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();
    console.log(`[OneSignal:${app.label}] Response ${response.status}:`, JSON.stringify(result));

    // Un `id` non vide est la seule preuve fiable de délivrance. OneSignal répond
    // 200 dans tous les cas, et `errors` peut être présent sur une notification
    // pourtant délivrée (`invalid_aliases` quand un alias parmi plusieurs échoue) :
    //   délivrée     -> { id: "09a6…", errors: { invalid_aliases: … } }
    //   non délivrée -> { id: "", errors: ["All included players are not subscribed"] }
    //   non délivrée -> { id: "", errors: { invalid_aliases: … } }
    // `recipients` n'est pas exploitable non plus : absent quand on cible par alias.
    const notificationId = typeof result?.id === "string" ? result.id : "";
    return {
      label: app.label,
      ok: response.ok,
      status: response.status,
      delivered: response.ok && notificationId.length > 0,
      notificationId,
      result,
    };
  } catch (e) {
    // Une app injoignable ne doit pas empêcher l'envoi par l'autre.
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[OneSignal:${app.label}] Request failed:`, message);
    return { label: app.label, ok: false, status: 502, delivered: false, notificationId: "", result: { errors: [message] } };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Security: Verify the request is coming from an authorized source
    // This function should only be called by other edge functions using service role
    const authHeader = req.headers.get("authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!authHeader) {
      console.error("[OneSignal] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the request uses the service role key (for internal edge function calls)
    // or a valid user JWT (for authenticated users)
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey;
    
    if (!isServiceRole) {
      // For non-service-role calls, verify it's a valid Supabase JWT
      // by checking if it's coming from an authenticated Supabase client
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const isAnonKey = token === anonKey;
      
      if (isAnonKey) {
        // Anonymous calls are not allowed - this function is for internal use only
        console.error("[OneSignal] Unauthorized: Anonymous access not allowed");
        return new Response(
          JSON.stringify({ error: "Unauthorized - This function is for internal use only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // For user JWTs, we could validate them here, but for now we'll be strict
      // and only allow service role calls
      console.error("[OneSignal] Unauthorized: Only service role calls allowed");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Only internal service calls allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apps = oneSignalApps();
    if (apps.length === 0) {
      throw new Error("OneSignal credentials not configured");
    }

    const { userId, title, body, titleFr, bodyFr, data } = await req.json();

    console.log("[OneSignal] Sending notification to user:", userId);
    console.log("[OneSignal] Title:", title);
    console.log("[OneSignal] Body:", body);

    // Un envoi par app : le thérapeute n'est abonné que dans celle du domaine où
    // il a installé la PWA, les autres répondent « non abonné ».
    const attempts = await Promise.all(
      apps.map((app) => sendThroughApp(app, { userId, title, body, titleFr, bodyFr, data })),
    );
    const winner = attempts.find((a) => a.delivered);
    const delivered = !!winner;
    // Erreur HTTP seulement si aucune app n'a pu répondre correctement.
    const httpFailure = !delivered && attempts.every((a) => !a.ok) ? attempts[0] : null;
    const status = httpFailure ? "error" : delivered ? "delivered" : "undelivered";
    const errors = attempts.map((a) => ({ app: a.label, errors: a.result?.errors ?? a.result }));

    if (!delivered) {
      console.error(`[OneSignal] Not delivered to ${userId} (${status}):`, JSON.stringify(errors));
    }

    await logDelivery({
      user_id: userId,
      booking_id: data?.bookingId ?? null,
      notification_type: data?.type ?? null,
      status,
      onesignal_notification_id: winner?.notificationId ?? null,
      error: delivered ? null : JSON.stringify(errors).slice(0, 500),
    });

    if (httpFailure) {
      return new Response(
        JSON.stringify({ success: false, delivered: false, error: httpFailure.result }),
        { status: httpFailure.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Statut HTTP 200 même sans délivrance : l'appel a bien abouti, et plusieurs
    // appelants réessaient ou remontent une erreur sur un échec réseau. C'est
    // `delivered` qui porte l'information, à lire par qui compte les envois.
    return new Response(
      JSON.stringify({
        success: delivered,
        delivered,
        notificationId: winner?.notificationId ?? "",
        app: winner?.label ?? null,
        result: winner?.result ?? { errors },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[OneSignal] Error in send-push-notification:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
