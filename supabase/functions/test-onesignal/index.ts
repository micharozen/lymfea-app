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

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error("OneSignal credentials not configured");
    }

    const { userId } = await req.json();

    console.log("[OneSignal Test] Sending test notification");
    console.log("[OneSignal Test] App ID:", ONESIGNAL_APP_ID);
    console.log("[OneSignal Test] Target user:", userId || "all subscribers");

    let notificationPayload: any = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: "🎉 Test OneSignal" },
      contents: { en: "Si vous voyez cette notification, ça marche !" },
      data: { url: "/pwa/dashboard", test: true },
    };

    // If userId provided, target that specific user
    if (userId) {
      notificationPayload.include_aliases = {
        external_id: [userId]
      };
      notificationPayload.target_channel = "push";
    } else {
      // Send to all subscribed users
      notificationPayload.included_segments = ["Subscribed Users"];
    }

    console.log("[OneSignal Test] Payload:", JSON.stringify(notificationPayload, null, 2));

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();
    console.log("[OneSignal Test] Response status:", response.status);
    console.log("[OneSignal Test] Response:", JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ 
        success: response.ok, 
        status: response.status,
        result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[OneSignal Test] Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
