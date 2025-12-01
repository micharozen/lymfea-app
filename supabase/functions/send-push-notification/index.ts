import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64 URL encoding/decoding utilities
function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): ArrayBuffer {
  const padding = '='.repeat((4 - str.length % 4) % 4);
  const base64 = (str + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

// Create VAPID JWT token
async function createVapidJwt(
  audience: string,
  subject: string,
  publicKeyBase64: string,
  privateKeyBase64: string
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 60 * 60, sub: subject };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)).buffer);
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import the private key using JWK
  const privateKeyBytes = new Uint8Array(base64UrlDecode(privateKeyBase64));
  const publicKeyBytes = new Uint8Array(base64UrlDecode(publicKeyBase64));
  
  // Public key is 65 bytes: 0x04 | x (32 bytes) | y (32 bytes)
  const x = base64UrlEncode(publicKeyBytes.slice(1, 33).buffer);
  const y = base64UrlEncode(publicKeyBytes.slice(33, 65).buffer);
  const d = base64UrlEncode(privateKeyBytes.buffer);
  
  const jwk = { kty: 'EC', crv: 'P-256', x, y, d };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncode(signatureBuffer)}`;
}

// Concatenate ArrayBuffers
function concat(...buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

// Encrypt payload using aes128gcm
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<ArrayBuffer> {
  const payloadBytes = new TextEncoder().encode(payload);
  
  // Generate local key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  // Import subscriber's public key
  const subscriberPublicKeyBuffer = base64UrlDecode(p256dhKey);
  const subscriberPublicKey = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPublicKey },
    localKeyPair.privateKey,
    256
  );
  
  // Export local public key
  const localPublicKeyBuffer = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  const localPublicKey = new Uint8Array(localPublicKeyBuffer);
  
  // Import auth secret
  const authSecretBuffer = base64UrlDecode(authSecret);
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive IKM using HKDF - RFC 8291
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  // keyInfo for IKM derivation
  const keyInfoStr = 'WebPush: info\x00';
  const keyInfo = concat(
    new TextEncoder().encode(keyInfoStr).buffer,
    subscriberPublicKeyBuffer,
    localPublicKeyBuffer
  );
  
  // Derive IKM
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecretBuffer, info: keyInfo },
    sharedSecretKey,
    256
  );
  
  // Import IKM for further derivation
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  // Derive CEK (Content Encryption Key)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt.buffer, info: cekInfo.buffer },
    ikmKey,
    128
  );
  
  // Derive nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt.buffer, info: nonceInfo.buffer },
    ikmKey,
    96
  );
  
  // Import CEK for AES-GCM
  const cek = await crypto.subtle.importKey(
    'raw',
    cekBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Add padding delimiter (0x02 = final record)
  const paddedPayload = concat(payloadBytes.buffer, new Uint8Array([2]).buffer);
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits },
    cek,
    paddedPayload
  );
  
  // Build the aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  
  const header = concat(
    salt.buffer,
    recordSize.buffer,
    new Uint8Array([65]).buffer, // idlen (65 for uncompressed point)
    localPublicKeyBuffer
  );
  
  return concat(header, encryptedBuffer);
}

// Send push notification using native fetch
async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;

  // Create VAPID JWT
  const jwt = await createVapidJwt(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Encrypt the payload
  const encryptedPayload = await encryptPayload(
    payload,
    subscription.keys.p256dh,
    subscription.keys.auth
  );

  // Send the request
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: encryptedPayload,
  });

  return response;
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

    const notificationPayload = JSON.stringify({
      title: title || "OOM",
      body: body || "Nouvelle notification",
      data: { ...data, url: data?.url || "/pwa/dashboard" },
    });

    // Send notification to each token
    const results = await Promise.allSettled(
      tokens.map(async ({ token, endpoint, id }) => {
        try {
          const subscriptionData = JSON.parse(token);
          
          // Construct subscription object
          const subscription = {
            endpoint: endpoint,
            keys: {
              p256dh: subscriptionData.keys?.p256dh || subscriptionData.p256dh,
              auth: subscriptionData.keys?.auth || subscriptionData.auth,
            }
          };

          console.log("Sending to endpoint:", endpoint.substring(0, 50) + "...");
          
          // Send using native implementation
          const response = await sendPushNotification(
            subscription,
            notificationPayload,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
            'mailto:support@oomworld.com'
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Push failed with status ${response.status}:`, errorText);
            
            if (response.status === 410 || response.status === 404) {
              await supabaseClient.from("push_tokens").delete().eq("id", id);
              console.log("Removed invalid token");
            }
            
            throw new Error(`Push failed: ${response.status}`);
          }
          
          console.log("Successfully sent notification");
          return { success: true, endpoint };
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error("Error sending to token:", errorMsg);
          return { success: false, endpoint, error: errorMsg };
        }
      })
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { success: boolean }).success
    ).length;
    const failed = results.length - successful;

    console.log(`Notification sent: ${successful} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, sent: successful, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
