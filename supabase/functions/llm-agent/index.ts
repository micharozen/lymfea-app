// Consolidated LLM edge function — routes one of N actions to the right
// handler. Mirrors the structure of `stripe-payment` for consistency.
//
// Usage from frontend:
//   await supabase.functions.invoke('llm-agent', {
//     body: { action: 'generate-inquiry-reply', inquiryId }
//   })
//
// Usage from other edge functions:
//   await supabaseAdmin.functions.invoke('llm-agent', {
//     body: { action: 'parse-email', ...input }
//   })

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

import { parseEmailWithLlm, type ParseEmailInput } from "./actions/parseEmail.ts";
import { generateInquiryReply } from "./actions/generateInquiryReply.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch (_e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    return jsonResponse({ error: "Missing `action` field" }, 400);
  }

  try {
    switch (action) {
      case "parse-email": {
        const input = body as unknown as ParseEmailInput & { action: string };
        const result = await parseEmailWithLlm({
          subject: input.subject ?? null,
          bodyText: input.bodyText ?? null,
          bodyHtml: input.bodyHtml ?? null,
          fromAddress: input.fromAddress,
          venueName: input.venueName ?? null,
          treatments: input.treatments ?? [],
        });
        return jsonResponse(result);
      }

      case "generate-inquiry-reply": {
        const inquiryId = typeof body.inquiryId === "string" ? body.inquiryId : null;
        if (!inquiryId) {
          return jsonResponse({ error: "Missing `inquiryId`" }, 400);
        }
        const { result, error } = await generateInquiryReply(supabaseAdmin, inquiryId);
        if (error || !result) {
          return jsonResponse({ error: error ?? "Failed to generate reply" }, 500);
        }
        return jsonResponse(result);
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[llm-agent] action=${action} failed:`, message);
    return jsonResponse({ error: message }, 500);
  }
});
