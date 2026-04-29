import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EnsureUserRoleRequest = {
  userId?: string;
  email?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate caller — only the user themselves can sync their own role.
    // The body-supplied userId/email is ignored in favor of the JWT's verified identity
    // to prevent a privilege-escalation path where an attacker submits another user's id+email.
    const authHeader = req.headers.get("Authorization");
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userId = user.id;
    const email = user.email ?? undefined;
    // Body is parsed for backward compatibility but its values are ignored.
    try { await req.json(); } catch (_) { /* body is optional */ }

    // Determine role by presence in domain tables
    let role: "admin" | "concierge" | "therapist" | null = null;

    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (adminRow) {
      role = "admin";
    } else {
      const { data: conciergeRow } = await supabaseAdmin
        .from("concierges")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (conciergeRow) {
        role = "concierge";
      } else {
        const { data: therapistRow } = await supabaseAdmin
          .from("therapists")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (therapistRow) role = "therapist";
      }
    }

    // If user_id isn't synced yet in admins/concierges, try to sync by email (if provided)
    if (!role && email) {
      const emailNorm = email.trim().toLowerCase();

      const { data: adminByEmail } = await supabaseAdmin
        .from("admins")
        .select("id")
        .ilike("email", emailNorm)
        .maybeSingle();

      if (adminByEmail) {
        role = "admin";
        await supabaseAdmin.from("admins").update({ user_id: userId }).ilike("email", emailNorm);
      } else {
        const { data: conciergeByEmail } = await supabaseAdmin
          .from("concierges")
          .select("id")
          .ilike("email", emailNorm)
          .maybeSingle();

      if (conciergeByEmail) {
          role = "concierge";
          await supabaseAdmin.from("concierges").update({ user_id: userId, status: "active" }).ilike("email", emailNorm);
        }
      }
    }

    // Auto-activate concierges on first login
    if (role === "concierge") {
      await supabaseAdmin
        .from("concierges")
        .update({ status: "active" })
        .eq("user_id", userId)
        .eq("status", "pending");
    }

    if (role) {
      // Ensure role row exists
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    }

    return new Response(JSON.stringify({ ok: true, role }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in ensure-user-role:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
