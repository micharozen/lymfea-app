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

// Helper function to convert URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper to convert Uint8Array to URL-safe base64
function uint8ArrayToUrlBase64(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
      .select("token, endpoint, id")
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

    const payload = JSON.stringify({
      title: title || "OOM",
      body: body || "Nouvelle notification",
      data: {
        ...data,
        url: data?.url || "/pwa/dashboard",
      },
    });

    // Send notification to each token
    const results = await Promise.allSettled(
      tokens.map(async ({ token, endpoint, id }) => {
        try {
          const subscriptionData = JSON.parse(token);
          const subscription: PushSubscription = {
            endpoint,
            keys: subscriptionData
          };

          // Import the VAPID private key
          const vapidPrivateKeyBytes = urlBase64ToUint8Array(VAPID_PRIVATE_KEY);
          // Create a new ArrayBuffer from the Uint8Array
          const arrayBuffer = new ArrayBuffer(vapidPrivateKeyBytes.length);
          const view = new Uint8Array(arrayBuffer);
          view.set(vapidPrivateKeyBytes);
          
          const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            arrayBuffer,
            {
              name: 'ECDSA',
              namedCurve: 'P-256',
            },
            true,
            ['sign']
          );

          // Create JWT
          const jwtHeader = { typ: 'JWT', alg: 'ES256' };
          const jwtPayload = {
            aud: new URL(subscription.endpoint).origin,
            exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
            sub: 'mailto:support@oomworld.com',
          };

          const encoder = new TextEncoder();
          const headerB64 = uint8ArrayToUrlBase64(encoder.encode(JSON.stringify(jwtHeader)));
          const payloadB64 = uint8ArrayToUrlBase64(encoder.encode(JSON.stringify(jwtPayload)));
          const unsignedToken = `${headerB64}.${payloadB64}`;

          const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            privateKey,
            encoder.encode(unsignedToken)
          );

          const signatureB64 = uint8ArrayToUrlBase64(new Uint8Array(signature));
          const jwt = `${unsignedToken}.${signatureB64}`;

          // Send push notification
          const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '86400',
              'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
            },
            body: payload,
          });

          if (response.status === 410) {
            // Token invalid, delete it
            await supabaseClient
              .from("push_tokens")
              .delete()
              .eq("id", id);
            console.log("Removed invalid token:", endpoint);
            return { success: false, endpoint, error: 'Token expired' };
          } else if (response.ok) {
            console.log("Successfully sent notification to:", endpoint);
            return { success: true, endpoint };
          } else {
            const errorText = await response.text();
            console.error("Failed to send:", response.status, errorText);
            return { success: false, endpoint, error: `Status ${response.status}` };
          }
        } catch (error: any) {
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
