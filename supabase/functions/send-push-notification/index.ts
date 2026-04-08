import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SITE_URL = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;

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
      headings: { en: title || brand.name },
      contents: { en: body || "Nouvelle notification" },
      // Primary URL for notification click (OneSignal REST API uses 'url')
      url: clickUrl,
      // Include URL in data as backup for SDK click handler
      data: { ...data, launchUrl: clickUrl, url: data?.url },
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
