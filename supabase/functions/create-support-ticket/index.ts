import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  category: z.enum(["question", "billing", "booking", "problem", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

const CATEGORY_LABELS: Record<string, string> = {
  question: "Question",
  billing: "Facturation",
  booking: "Réservation",
  problem: "Problème",
  other: "Autre",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  low: { label: "Basse", color: "#3498db", emoji: "🔵" },
  medium: { label: "Moyenne", color: "#f39c12", emoji: "🟡" },
  high: { label: "Haute", color: "#e67e22", emoji: "🟠" },
  urgent: { label: "Urgente", color: "#e74c3c", emoji: "🔴" },
};

async function getCreatorInfo(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<{ name: string; role: string }> {
  // Check user role
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = roleData?.role || "unknown";

  // Fetch name based on role
  if (role === "admin") {
    const { data } = await supabaseAdmin
      .from("admins")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { name: `${data.first_name} ${data.last_name}`, role: "Admin" };
  } else if (role === "concierge") {
    const { data } = await supabaseAdmin
      .from("concierges")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { name: `${data.first_name} ${data.last_name}`, role: "Concierge" };
  } else if (role === "hairdresser") {
    const { data } = await supabaseAdmin
      .from("hairdressers")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { name: `${data.first_name} ${data.last_name}`, role: "Thérapeute" };
  }

  return { name: "Utilisateur inconnu", role };
}

async function sendSlackNotification(ticket: {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  creator_name: string;
  creator_role: string;
}): Promise<void> {
  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_SUPPORT");
  if (!webhookUrl) {
    console.warn("[Support] SLACK_WEBHOOK_SUPPORT not configured, skipping Slack notification");
    return;
  }

  const SITE_URL = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
  const ticketUrl = `${SITE_URL}/admin/support`;
  const priorityConfig = PRIORITY_CONFIG[ticket.priority];
  const categoryLabel = CATEGORY_LABELS[ticket.category];
  const truncatedDesc =
    ticket.description.length > 300
      ? ticket.description.substring(0, 300) + "..."
      : ticket.description;

  const slackMessage = {
    attachments: [
      {
        color: priorityConfig.color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🎫 Nouveau ticket support`,
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${ticket.subject}*`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Catégorie:*\n${categoryLabel}` },
              { type: "mrkdwn", text: `*Priorité:*\n${priorityConfig.emoji} ${priorityConfig.label}` },
              { type: "mrkdwn", text: `*Créé par:*\n${ticket.creator_name}` },
              { type: "mrkdwn", text: `*Rôle:*\n${ticket.creator_role}` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Description:*\n${truncatedDesc}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Voir les tickets", emoji: true },
                url: ticketUrl,
                style: "primary",
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slackMessage),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Support] Slack error:", errorText);
  } else {
    console.log("[Support] Slack notification sent");
  }
}

async function createNotionPage(ticket: {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  creator_name: string;
  creator_role: string;
}): Promise<string | null> {
  const notionApiKey = Deno.env.get("NOTION_API_KEY");
  const notionDbId = Deno.env.get("NOTION_DATABASE_ID");

  if (!notionApiKey || !notionDbId) {
    console.warn("[Support] Notion not configured, skipping page creation");
    return null;
  }

  const categoryLabel = CATEGORY_LABELS[ticket.category];
  const priorityConfig = PRIORITY_CONFIG[ticket.priority];

  const body = {
    parent: { database_id: notionDbId },
    properties: {
      Name: {
        title: [{ text: { content: ticket.subject } }],
      },
      Status: {
        select: { name: "Open" },
      },
      Priority: {
        select: { name: priorityConfig.label },
      },
      Category: {
        select: { name: categoryLabel },
      },
      Creator: {
        rich_text: [{ text: { content: `${ticket.creator_name} (${ticket.creator_role})` } }],
      },
      "Ticket ID": {
        rich_text: [{ text: { content: ticket.id } }],
      },
    },
    children: [
      {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [{ type: "text" as const, text: { content: ticket.description } }],
        },
      },
    ],
  };

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Support] Notion error:", errorText);
    return null;
  }

  const data = await response.json();
  console.log("[Support] Notion page created:", data.id);
  return data.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with their JWT
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate input
    const requestBody = await req.json();
    const validated = TicketSchema.parse(requestBody);

    // Service role client for DB operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get creator info
    const creatorInfo = await getCreatorInfo(supabaseAdmin, user.id);

    // Insert ticket
    const { data: ticket, error: insertError } = await supabaseAdmin
      .from("tickets")
      .insert({
        subject: validated.subject,
        description: validated.description,
        category: validated.category,
        priority: validated.priority,
        status: "open",
        created_by: user.id,
        creator_name: creatorInfo.name,
        creator_role: creatorInfo.role,
      })
      .select()
      .single();

    if (insertError || !ticket) {
      console.error("[Support] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Support] Ticket created:", ticket.id);

    // Fire-and-forget: Slack + Notion
    const ticketPayload = {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      creator_name: creatorInfo.name,
      creator_role: creatorInfo.role,
    };

    const results = await Promise.allSettled([
      sendSlackNotification(ticketPayload),
      createNotionPage(ticketPayload),
    ]);

    // Update ticket with Notion page ID if available
    const notionResult = results[1];
    if (notionResult.status === "fulfilled" && notionResult.value) {
      await supabaseAdmin
        .from("tickets")
        .update({ notion_page_id: notionResult.value })
        .eq("id", ticket.id);
    }

    return new Response(
      JSON.stringify({ ticket }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Support] Error:", error);
    const message = error instanceof z.ZodError
      ? `Validation error: ${error.errors.map((e) => e.message).join(", ")}`
      : error instanceof Error
      ? error.message
      : "Unknown error";

    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
