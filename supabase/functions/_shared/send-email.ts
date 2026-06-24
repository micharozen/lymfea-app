import { brand } from "./brand.ts";
import { supabaseAdmin } from "./supabase-admin.ts";

/**
 * When provided to `sendEmail`, a successful send is recorded as a line in the
 * booking history (audit_log, change_type='action', action='email_sent').
 */
export interface EmailAuditInfo {
  /** bookings.id (uuid) — used as audit_log.record_id */
  bookingId: string;
  /** Stable email identifier, e.g. 'booking_confirmation' */
  emailType: string;
  /** Admin/user who triggered the send; null for system/cron sends */
  actorUserId?: string | null;
  /** Extra context stored on the audit row's metadata */
  metadata?: Record<string, unknown>;
}

interface SendEmailWithHtml {
  to: string | string[];
  subject: string;
  from?: string;
  html: string;
  headers?: Record<string, string>;
  audit?: EmailAuditInfo;
  templateId?: never;
  templateVariables?: never;
}

interface SendEmailWithTemplate {
  to: string | string[];
  subject?: string;
  from?: string;
  html?: never;
  headers?: Record<string, string>;
  audit?: EmailAuditInfo;
  templateId: string;
  templateVariables?: Record<string, string>;
}

type SendEmailOptions = SendEmailWithHtml | SendEmailWithTemplate;

interface SendEmailResult {
  id?: string;
  error?: string;
}

/**
 * Send an email via the Resend REST API.
 * Supports either raw `html` or a Resend `templateId` + `templateVariables`.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { error: "RESEND_API_KEY is not configured" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const isLocal =
    Deno.env.get("IS_LOCAL") === "true" ||
    /kong|127\.0\.0\.1|localhost/.test(supabaseUrl) ||
    /localhost|127\.0\.0\.1/.test(siteUrl) ||
    (Deno.env.get("SUPABASE_ANON_KEY") ?? "").includes("supabase-demo");
  const intendedRecipients = Array.isArray(options.to) ? options.to : [options.to];
  const to = isLocal ? ["romainthierryom@gmail.com"] : intendedRecipients;
  const from = isLocal
    ? "onboarding@resend.dev"
    : (options.from ?? brand.emails.from.default);

  const body: Record<string, unknown> = { from, to };

  if (options.subject) {
    body.subject = options.subject;
  }

  if (options.templateId) {
    body.template = {
      id: options.templateId,
      variables: options.templateVariables ?? {},
    };
  } else if (options.html) {
    body.html = options.html;
  }

  if (options.headers && Object.keys(options.headers).length > 0) {
    body.headers = options.headers;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.message ?? JSON.stringify(data);
    console.error("[send-email] Resend API error:", errorMsg);
    return { error: errorMsg };
  }

  // Record a booking-history line for each successfully sent email.
  if (options.audit) {
    await logBookingEmail(options.audit, intendedRecipients, options.html ?? null, data.id ?? null);
  }

  return { id: data.id };
}

/**
 * Insert a `email_sent` action into the booking history. Never throws — a
 * logging failure must not break the email flow.
 *
 * Two preview sources are recorded: the rendered `html` for raw-HTML sends
 * (stored locally, permanent), and the Resend `resendId` for template sends
 * (the body lives at Resend and is fetched on demand). `has_preview` lets the
 * history list show a preview button without fetching the body.
 */
async function logBookingEmail(
  audit: EmailAuditInfo,
  recipients: string[],
  html: string | null,
  resendId: string | null,
): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      table_name: "bookings",
      record_id: audit.bookingId,
      changed_by: audit.actorUserId ?? null,
      change_type: "action",
      old_values: null,
      new_values: {
        action: "email_sent",
        email_type: audit.emailType,
        recipients,
        has_preview: html != null || resendId != null,
      },
      source: audit.actorUserId ? "admin" : "system",
      metadata: audit.metadata ?? {},
      email_html: html,
      resend_email_id: resendId,
    });
  } catch (err) {
    console.error("[send-email] Failed to write booking history:", err);
  }
}
