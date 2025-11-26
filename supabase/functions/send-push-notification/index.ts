import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { userId, title, body, data } = await req.json();

    console.log("Sending push notification to user:", userId);

    // Get user's push tokens
    const { data: tokens, error: tokensError } = await supabaseClient
      .from("push_tokens")
      .select("token, endpoint")
      .eq("user_id", userId);

    if (tokensError) {
      console.error("Error fetching tokens:", tokensError);
      throw tokensError;
    }

    if (!tokens || tokens.length === 0) {
      console.log("No push tokens found for user:", userId);
      return new Response(
        JSON.stringify({ success: true, message: "No tokens to send to" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tokens.length} token(s) for user`);

    // Get VAPID keys from environment
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID keys not configured");
    }

    // Send notification to each token
    const results = await Promise.allSettled(
      tokens.map(async ({ token, endpoint }) => {
        try {
          const subscription: PushSubscription = JSON.parse(token);
          
          // Use web-push library equivalent
          const payload = JSON.stringify({
            title,
            body,
            data: {
              ...data,
              url: data?.url || "/pwa/dashboard",
            },
          });

          // For now, we'll use a simple fetch approach
          // In production, you might want to use a proper web-push library
          const response = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "TTL": "86400",
            },
            body: payload,
          });

          if (!response.ok) {
            console.error(`Failed to send to ${endpoint}:`, response.status);
            
            // If token is invalid (410 Gone), remove it
            if (response.status === 410) {
              await supabaseClient
                .from("push_tokens")
                .delete()
                .eq("endpoint", endpoint);
              console.log("Removed invalid token:", endpoint);
            }
            
            return { success: false, endpoint };
          }

          console.log("Successfully sent notification to:", endpoint);
          return { success: true, endpoint };
        } catch (error) {
          console.error("Error sending to token:", error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, endpoint, error: errorMessage };
        }
      })
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failed = results.length - successful;

    console.log(`Notification sent: ${successful} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed: failed,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
