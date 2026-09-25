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
import { loadTreatmentRefs } from "../_shared/treatmentRefs.ts";
import { resolveRequestedDate } from "../_shared/requestedDate.ts";
import { generateInquiryReply } from "./actions/generateInquiryReply.ts";
import { extractVenueFromWebsite } from "./actions/extractVenueFromWebsite.ts";

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

      // Analyse d'un texte collé dans une tâche (mail transféré, message
      // WhatsApp…). Même extracteur que le webhook entrant : on résout le
      // catalogue du lieu côté serveur, le front n'a qu'un texte à fournir.
      case "parse-inquiry-text": {
        const hotelId = typeof body.hotelId === "string" ? body.hotelId : null;
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!hotelId) return jsonResponse({ error: "Missing `hotelId`" }, 400);
        if (!text) return jsonResponse({ error: "Missing `text`" }, 400);

        const { data: venue } = await supabaseAdmin
          .from("hotels")
          .select("name")
          .eq("id", hotelId)
          .maybeSingle();

        const result = await parseEmailWithLlm({
          subject: null,
          bodyText: text,
          bodyHtml: null,
          // Le texte est collé à la main : il n'a pas d'expéditeur propre.
          fromAddress: "",
          venueName: (venue?.name as string | null) ?? null,
          treatments: await loadTreatmentRefs(supabaseAdmin, hotelId),
        });

        // « Lundi ou mardi » : on retient la première date réellement ouvrable
        // plutôt que de laisser l'opérateur vérifier l'agenda à la main.
        if (result.parsed && result.parsed.requested_dates.length > 1) {
          const resolution = await resolveRequestedDate(supabaseAdmin, {
            hotelId,
            dates: result.parsed.requested_dates,
            treatmentIds: result.parsed.treatment_match?.id
              ? [result.parsed.treatment_match.id]
              : [],
            guestCount: result.parsed.guest_count,
          });
          result.parsed.requested_date = resolution.date ?? result.parsed.requested_date;
          return jsonResponse({ ...result, dateResolution: resolution });
        }
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

      // Onboarding wizard prefill: read the venue's public website and
      // extract answers. Called by venue-setup with the service role only.
      case "extract-venue-website": {
        const auth = req.headers.get("Authorization") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
          return jsonResponse({ error: "forbidden" }, 403);
        }
        const url = typeof body.url === "string" ? body.url.trim() : "";
        if (!url) return jsonResponse({ error: "Missing `url`" }, 400);
        const { result, error } = await extractVenueFromWebsite(url);
        if (error || !result) return jsonResponse({ error: error ?? "extraction_failed" }, 422);
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
