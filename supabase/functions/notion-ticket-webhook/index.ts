import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map Notion status names to our DB statuses
const NOTION_STATUS_MAP: Record<string, string> = {
  "Open": "open",
  "In Progress": "in_progress",
  "Resolved": "resolved",
  "Closed": "closed",
  "Done": "closed",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = Deno.env.get("NOTION_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");

    console.log("[NotionWebhook] Debug - expected:", webhookSecret, "received:", providedSecret);
    console.log("[NotionWebhook] Debug - all headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    if (!webhookSecret || providedSecret !== webhookSecret) {
      console.error("[NotionWebhook] Invalid or missing webhook secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("[NotionWebhook] Received:", JSON.stringify(body));

    // Extract Notion page ID and new status from the automation payload
    const notionPageId = body.data?.id || body.page_id;
    const newStatus = body.data?.properties?.Status?.select?.name || body.status;

    if (!notionPageId) {
      return new Response(
        JSON.stringify({ error: "Missing page_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map Notion status to our status
    const mappedStatus = newStatus ? NOTION_STATUS_MAP[newStatus] : null;
    if (!mappedStatus) {
      console.log("[NotionWebhook] Unknown or unmapped status:", newStatus, "- skipping");
      return new Response(
        JSON.stringify({ message: "Status not mapped, skipping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update ticket in DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .update({ status: mappedStatus, updated_at: new Date().toISOString() })
      .eq("notion_page_id", notionPageId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[NotionWebhook] Update error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticket) {
      console.warn("[NotionWebhook] No ticket found for notion_page_id:", notionPageId);
      return new Response(
        JSON.stringify({ message: "No matching ticket found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[NotionWebhook] Ticket ${ticket.id} updated to status: ${mappedStatus}`);

    return new Response(
      JSON.stringify({ success: true, ticketId: ticket.id, newStatus: mappedStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[NotionWebhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
