import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { lookupCompanyBySiren } from "../_shared/companyLookup.ts";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: authenticated admin only -------------------------------------
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "invalid_authentication" }, 401);
    }

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) return jsonResponse({ error: "forbidden" }, 403);

    // --- Input + lookup against the public gouv API --------------------------
    const body = await req.json().catch(() => ({}));
    const lookup = await lookupCompanyBySiren(body.siren);
    if (!lookup.ok) return jsonResponse({ error: lookup.error }, lookup.status);

    return jsonResponse({ success: true, company: lookup.company });
  } catch (err) {
    console.error("[lookup-company] error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unknown_error" },
      500,
    );
  }
});
