import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Generating VAPID keys...");
    
    const vapidKeys = webpush.generateVAPIDKeys();

    console.log("VAPID keys generated successfully");
    console.log("Public Key:", vapidKeys.publicKey);
    console.log("Private Key:", vapidKeys.privateKey);

    return new Response(
      JSON.stringify({
        success: true,
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
        instructions: [
          "1. Copy the public key and update the VAPID_PUBLIC_KEY secret",
          "2. Copy the private key and update the VAPID_PRIVATE_KEY secret",
          "3. Update the public key in usePushNotifications.ts (VITE_VAPID_PUBLIC_KEY)",
        ]
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating VAPID keys:", error);
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
