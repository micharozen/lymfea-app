import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { createTwentyLead } from "../_shared/twenty-crm.ts";
import { postSlackMessage } from "../_shared/slack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Boîte qui reçoit les demandes du formulaire public /support.
const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX_EMAIL") || "contact@saoma.io";
// Expéditeur : à basculer sur un domaine Saoma une fois vérifié côté Resend.
// Sans override, sendEmail retombe sur brand.emails.from.default.
const SUPPORT_FROM = Deno.env.get("SUPPORT_FROM_EMAIL");
// Webhook entrant Slack qui reçoit les demandes du formulaire public.
const SLACK_WEBHOOK_SUPPORT = Deno.env.get("SLACK_WEBHOOK_SUPPORT");

const CATEGORIES = [
  "integration",
  "technical",
  "billing",
  "account",
  "other",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  integration: "Intégration PMS (Opera Cloud / Mews)",
  technical: "Problème technique",
  billing: "Facturation & abonnement",
  account: "Compte & accès",
  other: "Autre",
};

const SupportRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  company: z.string().trim().min(1).max(160),
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(5000),
  /** Honeypot : rempli uniquement par les bots, la requête est alors ignorée. */
  website: z.string().max(255).optional().default(""),
});

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml(input: z.infer<typeof SupportRequestSchema>): string {
  const rows = [
    ["Nom", input.name],
    ["Email", input.email],
    ["Établissement", input.company],
    ["Catégorie", CATEGORY_LABELS[input.category]],
    ["Sujet", input.subject],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 8px 0; color: #888888; font-size: 13px; width: 140px;">${escapeHtml(label)}</td>
          <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Demande support Saoma</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 24px 32px;">
              <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">Nouvelle demande support</p>
              <p style="margin: 4px 0 0 0; color: #999999; font-size: 13px;">Formulaire public saoma.io/support</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
              <div style="margin-top: 24px; background-color: #f8f9fa; border-left: 4px solid #1a1a1a; border-radius: 0 8px 8px 0; padding: 20px;">
                <p style="margin: 0; color: #1a1a1a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(input.message)}</p>
              </div>
              <p style="margin: 24px 0 0 0; color: #888888; font-size: 13px;">
                Répondre directement à cet email écrit à ${escapeHtml(input.email)}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildSlackPayload(input: z.infer<typeof SupportRequestSchema>) {
  return {
    text: `Nouvelle demande support — ${input.subject}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Nouvelle demande support", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Nom*\n${input.name}` },
          { type: "mrkdwn", text: `*Email*\n${input.email}` },
          { type: "mrkdwn", text: `*Établissement*\n${input.company}` },
          { type: "mrkdwn", text: `*Catégorie*\n${CATEGORY_LABELS[input.category]}` },
        ],
      },
      {
        type: "section",
        // Slack rejette un bloc texte de plus de 3000 caractères, le message va jusqu'à 5000.
        text: {
          type: "mrkdwn",
          text: `*${input.subject}*\n${input.message}`.slice(0, 2900),
        },
      },
    ],
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = SupportRequestSchema.safeParse(await req.json());

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const input = parsed.data;

    // Honeypot rempli : on répond OK sans rien envoyer, pour ne pas guider le bot.
    if (input.website) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRM et Slack sont best-effort : seul l'échec de l'email fait échouer la requête.
    const [result, lead, slack] = await Promise.all([
      sendEmail({
        to: SUPPORT_INBOX,
        ...(SUPPORT_FROM ? { from: SUPPORT_FROM } : {}),
        subject: `[Support] ${input.subject}`,
        html: buildEmailHtml(input),
        headers: { "Reply-To": input.email },
      }),
      createTwentyLead({
        name: input.name,
        companyName: input.company,
        email: input.email,
        message: `[${CATEGORY_LABELS[input.category]}] ${input.subject}\n\n${input.message}`,
        source: "WEBSITE_FORM",
        submittedAt: new Date().toISOString(),
      }),
      SLACK_WEBHOOK_SUPPORT
        ? postSlackMessage(SLACK_WEBHOOK_SUPPORT, buildSlackPayload(input))
        : Promise.resolve({ ok: false, error: "SLACK_WEBHOOK_SUPPORT not configured" }),
    ]);

    if (!lead.ok) {
      console.error("[support-request] Twenty lead failed:", lead.error);
    }

    if (!slack.ok) {
      console.error("[support-request] Slack post failed:", slack.error);
    }

    if (result.error) {
      console.error("[support-request] send failed:", result.error);
      return new Response(JSON.stringify({ error: "Email delivery failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[support-request] unexpected error:", error);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
