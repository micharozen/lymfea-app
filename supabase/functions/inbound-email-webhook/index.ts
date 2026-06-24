// Resend Inbound webhook → email_inquiries.
//
// Phase 1 (MVP):
//  1. Verify HMAC signature (svix-style headers used by Resend Inbound).
//  2. Resolve the venue from the To: address (alias + domain).
//  3. Fetch the full message body from Resend's Received Emails API (the
//     webhook only contains metadata).
//  4. Ask Claude Haiku to extract structured booking intent.
//  5. Persist an `email_inquiries` row. Admins triage it manually from
//     /admin/inbox. Auto-conversion comes in Phase 2.
//
// `verify_jwt = false`: this endpoint is public, secured by the Resend
// signature verification below.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { TreatmentRef, TreatmentVariantRef, ParsedEmail } from "../llm-agent/actions/parseEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

interface ResendInboundPayload {
  // Resend `email.received` webhook payload (metadata only).
  // Body + headers + attachments must be fetched separately via
  // GET /emails/receiving/:email_id.
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string | { address?: string; name?: string };
    to?: string | string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    attachments?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface ResendReceivingEmail {
  id?: string;
  from?: string | { address?: string };
  to?: string | string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | Array<{ name: string; value: string }>;
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function allowedDomains(): string[] {
  return (Deno.env.get("INBOUND_EMAIL_DOMAINS") ?? "")
    .split(",")
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

// Resend sometimes returns "Display Name <email@host>" — extract the bare email.
function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim().toLowerCase();
  return email;
}

function normalizeAddress(input: unknown): string {
  if (typeof input === "string") return extractEmail(input);
  if (Array.isArray(input) && input.length > 0) return extractEmail(String(input[0]));
  if (input && typeof input === "object" && "address" in input) {
    return extractEmail(String((input as { address?: string }).address ?? ""));
  }
  return "";
}

// Resend uses Svix to sign webhooks. Header names: `svix-id`, `svix-timestamp`, `svix-signature`.
// Signature payload: `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the secret (base64-decoded).
// The header `svix-signature` is a space-separated list of `v1,<base64>` entries.
async function verifyResendSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_INBOUND_WEBHOOK_SECRET");
  if (!secret) {
    console.error("RESEND_INBOUND_WEBHOOK_SECRET not configured — rejecting webhook for safety");
    return false;
  }

  const svixId = req.headers.get("svix-id");
  const svixTs = req.headers.get("svix-timestamp");
  const svixSig = req.headers.get("svix-signature");
  if (!svixId || !svixTs || !svixSig) {
    console.error("Missing svix-* signature headers");
    return false;
  }

  // Reject replays older than 5 minutes.
  const tsSec = Number.parseInt(svixTs, 10);
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > 300) {
    console.error("Webhook timestamp out of tolerance");
    return false;
  }

  // Svix secrets are typically prefixed `whsec_` followed by base64.
  const secretB64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64Decode(secretB64);
  } catch {
    console.error("RESEND_INBOUND_WEBHOOK_SECRET is not valid base64");
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(`${svixId}.${svixTs}.${rawBody}`);
  const macBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const expected = base64Encode(macBytes);

  const provided = svixSig
    .split(" ")
    .map(s => s.trim())
    .filter(s => s.startsWith("v1,"))
    .map(s => s.slice(3));

  return provided.some(sig => timingSafeEqual(sig, expected));
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fetchFullEmail(id: string): Promise<ResendReceivingEmail | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY missing — cannot fetch received email body");
    return null;
  }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error(`Resend receiving fetch failed: ${res.status} ${await res.text()}`);
      return null;
    }
    return await res.json() as ResendReceivingEmail;
  } catch (err) {
    console.error("Resend receiving fetch error:", err);
    return null;
  }
}

async function loadVenueAndTreatments(toAddress: string): Promise<{
  hotelId: string | null;
  venueName: string | null;
  treatments: TreatmentRef[];
}> {
  const [alias, domain] = toAddress.split("@");
  if (!alias || !domain) return { hotelId: null, venueName: null, treatments: [] };

  if (!allowedDomains().includes(domain)) {
    console.warn(`Email received on unconfigured domain: ${domain}`);
    return { hotelId: null, venueName: null, treatments: [] };
  }

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("hotels")
    .select("id, name")
    .eq("inbound_email_alias", alias)
    .eq("inbound_email_domain", domain)
    .maybeSingle();

  if (venueError) {
    console.error("Venue lookup failed:", venueError);
    return { hotelId: null, venueName: null, treatments: [] };
  }
  if (!venue) {
    console.warn(`Unknown inbound alias: ${alias}@${domain}`);
    return { hotelId: null, venueName: null, treatments: [] };
  }

  const { data: treatmentRows, error: treatmentsError } = await supabaseAdmin
    .from("treatment_menus")
    .select("id, name, name_en, duration, category")
    .eq("hotel_id", venue.id)
    .eq("status", "active")
    .limit(100);

  if (treatmentsError) {
    console.error("Treatments lookup failed:", treatmentsError);
  }

  const treatmentIds = (treatmentRows ?? []).map(t => String(t.id));
  let variantsByTreatment = new Map<string, TreatmentVariantRef[]>();
  if (treatmentIds.length > 0) {
    const { data: variantRows, error: variantsError } = await supabaseAdmin
      .from("treatment_variants")
      .select("id, treatment_id, label, label_en, duration, guest_count, is_default")
      .in("treatment_id", treatmentIds)
      .eq("status", "active");
    if (variantsError) {
      console.error("Treatment variants lookup failed:", variantsError);
    }
    variantsByTreatment = (variantRows ?? []).reduce((acc, v) => {
      const tid = String(v.treatment_id);
      const list = acc.get(tid) ?? [];
      list.push({
        id: String(v.id),
        treatment_id: tid,
        label: (v.label as string | null) ?? null,
        label_en: (v.label_en as string | null) ?? null,
        duration: (v.duration as number | null) ?? null,
        guest_count: (v.guest_count as number | null) ?? null,
        is_default: Boolean(v.is_default),
      });
      acc.set(tid, list);
      return acc;
    }, new Map<string, TreatmentVariantRef[]>());
  }

  const treatments: TreatmentRef[] = (treatmentRows ?? []).map(t => ({
    id: String(t.id),
    name: (t.name as string | null) ?? null,
    name_en: (t.name_en as string | null) ?? null,
    duration: (t.duration as number | null) ?? null,
    category: (t.category as string | null) ?? null,
    variants: variantsByTreatment.get(String(t.id)) ?? [],
  }));

  return { hotelId: venue.id as string, venueName: (venue.name as string | null) ?? null, treatments };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();

  const signatureOk = await verifyResendSignature(req, rawBody);
  if (!signatureOk) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = payload.data ?? {};
  const fromAddress = normalizeAddress(data.from);
  const toAddress = normalizeAddress(data.to);
  const subject = (data.subject ?? null) as string | null;
  const messageId = (data.message_id ?? null) as string | null;
  const resendInboundId = (data.email_id ?? null) as string | null;

  if (!fromAddress || !toAddress) {
    return new Response(JSON.stringify({ error: "Missing from/to" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { hotelId, venueName, treatments } = await loadVenueAndTreatments(toAddress);

  // Always insert an inquiry — even orphan ones — for audit + debugging.
  const insertPayload = {
    hotel_id: hotelId,
    from_address: fromAddress,
    to_address: toAddress,
    subject,
    raw_payload: payload as unknown as Record<string, unknown>,
    status: "received",
    message_id: messageId,
  };

  const { data: inquiry, error: insertError } = await supabaseAdmin
    .from("email_inquiries")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !inquiry) {
    console.error("Failed to insert email_inquiry:", insertError);
    return new Response(JSON.stringify({ error: "DB insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!hotelId) {
    // Orphan: unknown alias or unconfigured domain. Keep it for review.
    await supabaseAdmin
      .from("email_inquiries")
      .update({ status: "failed", error_message: "Unknown venue alias or unconfigured domain" })
      .eq("id", inquiry.id);
    return new Response(JSON.stringify({ ok: true, inquiry_id: inquiry.id, venue: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch the full email body (Resend's 2-step API).
  let bodyText: string | null = null;
  let bodyHtml: string | null = null;
  if (resendInboundId) {
    const full = await fetchFullEmail(resendInboundId);
    if (full) {
      bodyText = full.text ?? null;
      bodyHtml = full.html ?? null;
    }
  }

  // Persist the raw bodies before parsing so they're available even if the LLM fails.
  await supabaseAdmin
    .from("email_inquiries")
    .update({ raw_body_text: bodyText, raw_body_html: bodyHtml })
    .eq("id", inquiry.id);

  const { data: parseData, error: invokeError } = await supabaseAdmin.functions.invoke("llm-agent", {
    body: {
      action: "parse-email",
      subject,
      bodyText,
      bodyHtml,
      fromAddress,
      venueName,
      treatments,
    },
  });
  const parsed = (parseData as { parsed: ParsedEmail | null } | null)?.parsed ?? null;
  const parseError = invokeError?.message
    ?? (parseData as { error: string | null } | null)?.error
    ?? null;

  if (parseError || !parsed) {
    await supabaseAdmin
      .from("email_inquiries")
      .update({ status: "failed", error_message: parseError ?? "Parse returned null" })
      .eq("id", inquiry.id);

    return new Response(JSON.stringify({ ok: true, inquiry_id: inquiry.id, parsed: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabaseAdmin
    .from("email_inquiries")
    .update({
      status: "parsed",
      parsed_data: parsed as unknown as Record<string, unknown>,
      confidence_score: parsed.intent_confidence,
    })
    .eq("id", inquiry.id);

  return new Response(JSON.stringify({ ok: true, inquiry_id: inquiry.id, parsed: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

serve(handler);
