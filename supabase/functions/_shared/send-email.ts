import { brand } from "./brand.ts";

interface SendEmailWithHtml {
  to: string | string[];
  subject: string;
  from?: string;
  html: string;
  templateId?: never;
  templateVariables?: never;
}

interface SendEmailWithTemplate {
  to: string | string[];
  subject?: string;
  from?: string;
  html?: never;
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

  const isLocal = Deno.env.get("IS_LOCAL") === "true";
  const to = isLocal
    ? ["romainthierryom@gmail.com"]
    : Array.isArray(options.to) ? options.to : [options.to];
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

  return { id: data.id };
}
