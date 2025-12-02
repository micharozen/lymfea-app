import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SITE_URL = Deno.env.get("SITE_URL") || "https://oom-clone-genesis.lovable.app";

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error("OneSignal credentials not configured");
    }

    const { userId, title, body, data } = await req.json();

    console.log("[OneSignal] Sending notification to user:", userId);
    console.log("[OneSignal] Title:", title);
    console.log("[OneSignal] Body:", body);

    // Build the full URL for notification click
    const clickUrl = data?.url ? `${SITE_URL}${data.url}` : SITE_URL;
    console.log("[OneSignal] Click URL:", clickUrl);

    // Send notification via OneSignal REST API
    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title || "OOM" },
      contents: { en: body || "Nouvelle notification" },
      // Include URL in data for SDK click handler
      data: { ...data, launchUrl: clickUrl },
      // web_url for when notification opens browser directly
      web_url: clickUrl,
      // Target by external user ID (the Supabase user_id)
      include_aliases: {
        external_id: [userId]
      },
      target_channel: "push",
      // Explicit short collapse_id
      collapse_id: data?.bookingId ? `b-${data.bookingId.substring(0, 8)}` : `n-${Date.now()}`
    };

    console.log("[OneSignal] Payload:", JSON.stringify(notificationPayload, null, 2));

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();
    console.log("[OneSignal] Response status:", response.status);
    console.log("[OneSignal] Response:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("[OneSignal] Error:", result);
      return new Response(
        JSON.stringify({ success: false, error: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, result }),
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
