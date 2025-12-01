import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Generating VAPID keys using Web Crypto API...");
    
    // Generate ECDSA P-256 key pair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"]
    );

    // Export the public key in raw format (uncompressed)
    const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const publicKeyBase64 = arrayBufferToBase64Url(publicKeyRaw);

    // Export the private key in PKCS8 format, then extract the raw key
    const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    
    // For VAPID, we need the raw 32-byte private key value
    // PKCS8 format has a header, so we extract the last 32 bytes which contain the actual key
    const privateKeyBytes = new Uint8Array(privateKeyPkcs8);
    // The raw private key is at the end of the PKCS8 structure
    const rawPrivateKey = privateKeyBytes.slice(-32);
    const privateKeyBase64 = arrayBufferToBase64Url(rawPrivateKey.buffer);

    console.log("VAPID keys generated successfully");
    console.log("Public Key:", publicKeyBase64);
    console.log("Private Key:", privateKeyBase64);

    return new Response(
      JSON.stringify({
        success: true,
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64,
        instructions: [
          "1. Copy the public key and update the VAPID_PUBLIC_KEY secret",
          "2. Copy the private key and update the VAPID_PRIVATE_KEY secret",
          "3. Update the public key in usePushNotifications.ts",
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
