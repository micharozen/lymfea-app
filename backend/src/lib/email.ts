import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Default sender address.
 * TODO: Import from brand.json like the Edge Functions do.
 */
const DEFAULT_FROM = "Eïa <no-reply@lymfea.com>";

interface SendEmailWithHtml {
  to: string | string[];
  subject: string;
  from?: string;
  html: string;
}

interface SendEmailWithTemplate {
  to: string | string[];
  subject?: string;
  from?: string;
  templateId: string;
  templateVariables?: Record<string, string>;
}

type SendEmailOptions = SendEmailWithHtml | SendEmailWithTemplate;

interface SendEmailResult {
  id?: string;
  error?: string;
}

/**
 * Send an email via Resend.
 * Equivalent to: supabase/functions/_shared/send-email.ts
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const to = Array.isArray(options.to) ? options.to : [options.to];
  const from = options.from ?? DEFAULT_FROM;

  try {
    if ("templateId" in options && options.templateId) {
      // Resend SDK doesn't support templates directly — use REST API
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from,
          to,
          subject: options.subject,
          template: {
            id: options.templateId,
            variables: options.templateVariables ?? {},
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { error: data?.message ?? JSON.stringify(data) };
      }
      return { id: data.id };
    }

    // HTML email via SDK
    if ("html" in options && options.html) {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject: options.subject ?? "",
        html: options.html,
      });

      if (error) return { error: error.message };
      return { id: data?.id };
    }

    return { error: "No html or templateId provided" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("[email] Error:", message);
    return { error: message };
  }
}
