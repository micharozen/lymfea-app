// Send an admin-authored reply to an inbound email inquiry.
//
// Flow:
//   1. Verify the caller is an admin/concierge (JWT lookup).
//   2. Load the root inquiry (must be direction='inbound').
//   3. Send the email via the shared Resend helper, threading via In-Reply-To.
//   4. Insert a new email_inquiries row as the outbound reply (direction='outbound',
//      parent_inquiry_id = root.id, status='sent').
//   5. Mark the root as status='replied' + last_reply_at=now().

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/send-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InquiryRow {
  id: string;
  hotel_id: string | null;
  from_address: string;
  to_address: string;
  subject: string | null;
  message_id: string | null;
  direction: string;
  parent_inquiry_id: string | null;
}

interface HotelRow {
  id: string;
  name: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string, venueName: string | null): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px 0">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const signature = venueName
    ? `<p style="margin:16px 0 0 0;color:#666;font-size:13px">${escapeHtml(venueName)}</p>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a">${paragraphs}${signature}</div>`;
}

function reSubject(original: string | null, override: string | null): string {
  const candidate = override?.trim() || original?.trim() || "votre demande";
  return candidate.toLowerCase().startsWith("re:") ? candidate : `Re: ${candidate}`;
}

// The admin can override the recipient: on a manually forwarded email the SMTP
// sender is the venue's own mailbox, not the client. The UI prefills the address
// extracted by the parser, so the override is always a reviewed value.
function validEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ error: `Authentication error: ${userError?.message ?? "no user"}` }, 401);
    }
    const userId = userData.user.id;

    const { data: hasAdmin, error: roleErr } = await supabaseClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: hasConcierge } = await supabaseClient.rpc("has_role", {
      _user_id: userId,
      _role: "concierge",
    });
    if (roleErr) return jsonResponse({ error: `Role check failed: ${roleErr.message}` }, 500);
    if (!hasAdmin && !hasConcierge) {
      return jsonResponse({ error: "Forbidden: admin or concierge role required" }, 403);
    }

    // 2. Input
    const body = await req.json().catch(() => ({}));
    const inquiryId = typeof body.inquiryId === "string" ? body.inquiryId : null;
    const subjectOverride = typeof body.subject === "string" ? body.subject : null;
    const replyBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!inquiryId) return jsonResponse({ error: "Missing inquiryId" }, 400);
    if (!replyBody) return jsonResponse({ error: "Missing body" }, 400);
    if (body.to !== undefined && validEmail(body.to) === null) {
      return jsonResponse({ error: "Invalid recipient address" }, 400);
    }
    const recipientOverride = validEmail(body.to);

    // 3. Load root inquiry
    const { data: inquiryData, error: inquiryErr } = await supabaseClient
      .from("email_inquiries")
      .select("id, hotel_id, from_address, to_address, subject, message_id, direction, parent_inquiry_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (inquiryErr) return jsonResponse({ error: `Inquiry lookup failed: ${inquiryErr.message}` }, 500);
    const inquiry = inquiryData as InquiryRow | null;
    if (!inquiry) return jsonResponse({ error: "Inquiry not found" }, 404);
    if (inquiry.direction !== "inbound" || inquiry.parent_inquiry_id !== null) {
      return jsonResponse({ error: "Can only reply to a root inbound inquiry" }, 400);
    }

    // 4. Load venue (for signature)
    let venueName: string | null = null;
    if (inquiry.hotel_id) {
      const { data: hotelData } = await supabaseClient
        .from("hotels")
        .select("id, name")
        .eq("id", inquiry.hotel_id)
        .maybeSingle();
      venueName = (hotelData as HotelRow | null)?.name ?? null;
    }

    // 5. Send via Resend (helper supports headers for threading)
    const finalSubject = reSubject(inquiry.subject, subjectOverride);
    const html = bodyToHtml(replyBody, venueName);
    const headers: Record<string, string> = {};
    if (inquiry.message_id) {
      headers["In-Reply-To"] = inquiry.message_id;
      headers["References"] = inquiry.message_id;
    }

    const recipient = recipientOverride ?? inquiry.from_address;

    const sendResult = await sendEmail({
      from: inquiry.to_address,
      to: recipient,
      subject: finalSubject,
      html,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (sendResult.error || !sendResult.id) {
      return jsonResponse({ error: `Email send failed: ${sendResult.error ?? "no id"}` }, 502);
    }

    // 6. Persist outbound row
    const { data: outbound, error: insertErr } = await supabaseClient
      .from("email_inquiries")
      .insert({
        hotel_id: inquiry.hotel_id,
        parent_inquiry_id: inquiry.id,
        direction: "outbound",
        from_address: inquiry.to_address,
        to_address: recipient,
        subject: finalSubject,
        raw_body_text: replyBody,
        raw_body_html: html,
        status: "sent",
        message_id: sendResult.id,
        sent_by: userId,
      })
      .select("id, created_at")
      .single();

    if (insertErr) {
      // Soft-fail: email was sent, only persistence failed.
      console.error("[send-inquiry-reply] outbound insert failed:", insertErr);
      return jsonResponse({
        ok: true,
        sent: true,
        persisted: false,
        warning: insertErr.message,
        resendId: sendResult.id,
      });
    }

    // 7. Mark root as replied
    const { error: updateErr } = await supabaseClient
      .from("email_inquiries")
      .update({ status: "replied", last_reply_at: new Date().toISOString() })
      .eq("id", inquiry.id);

    if (updateErr) {
      console.error("[send-inquiry-reply] root update failed:", updateErr);
    }

    return jsonResponse({
      ok: true,
      sent: true,
      persisted: true,
      resendId: sendResult.id,
      replyId: (outbound as { id: string }).id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-inquiry-reply] error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
