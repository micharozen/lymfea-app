import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Return the rendered HTML of a sent email for a booking-history line.
 *
 * - Raw-HTML emails: the body is stored on `audit_log.email_html` → returned directly.
 * - Template emails: only `resend_email_id` is stored → the body is fetched on
 *   demand from Resend (GET /emails/:id), which renders and retains the template.
 *
 * The audit row is read with the caller's JWT so RLS decides whether they may
 * see this booking's history.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { auditId } = await req.json();
    if (!auditId || typeof auditId !== "string") {
      return json({ error: "auditId is required" }, 400);
    }

    // Read the audit row with the caller's token → RLS enforces access.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: row, error } = await supabase
      .from("audit_log")
      .select("email_html, resend_email_id")
      .eq("id", auditId)
      .eq("table_name", "bookings")
      .single();

    if (error || !row) {
      return json({ error: "Not found or not authorized" }, 404);
    }

    // Fast path: HTML stored locally.
    if (row.email_html) {
      return json({ html: row.email_html });
    }

    // Template email: fetch the rendered body from Resend.
    if (row.resend_email_id) {
      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) {
        return json({ error: "RESEND_API_KEY is not configured" }, 500);
      }

      const resp = await fetch(`https://api.resend.com/emails/${row.resend_email_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await resp.json();

      if (!resp.ok) {
        console.error("[get-email-html] Resend API error:", data?.message ?? data);
        return json({ html: null });
      }

      return json({ html: data?.html ?? null });
    }

    return json({ html: null });
  } catch (err) {
    console.error("[get-email-html] error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
