import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CheckAdminRequest {
  emailOrPhone: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }), 
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { emailOrPhone }: CheckAdminRequest = await req.json();
    if (!emailOrPhone) {
      return new Response(JSON.stringify({ error: "Email or phone is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const cleaned = emailOrPhone.replace(/\s+/g, "");
    const isEmail = cleaned.includes("@");

    // 1) Resolve admin by email or phone
    let adminEmail: string | null = null;
    if (isEmail) {
      const { data, error } = await supabaseAdmin
        .from("admins")
        .select("email, user_id")
        .eq("email", cleaned)
        .maybeSingle();
      if (error) throw error;
      adminEmail = data?.email ?? null;
    } else {
      // Normalize phone: remove spaces and leading 0s
      const phoneToSearch = cleaned.replace(/^0+/, "");
      const { data, error } = await supabaseAdmin
        .from("admins")
        .select("email, user_id, phone");
      if (error) throw error;
      const match = data?.find((a) => a.phone?.replace(/\s+/g, "").replace(/^0+/, "") === phoneToSearch);
      adminEmail = match?.email ?? null;
    }

    if (!adminEmail) {
      return new Response(JSON.stringify({ exists: false, hasAccount: false, email: null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2) Check if an auth user already exists for this email (iterate through pages)
    let hasAccount = false;
    let foundUserId: string | null = null;
    let page = 1;
    while (page <= 10) { // safety cap
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) throw listErr;
      const match = list?.users?.find((u: any) => u.email?.toLowerCase() === adminEmail!.toLowerCase());
      if (match) {
        hasAccount = true;
        foundUserId = match.id;
        break;
      }
      if (!list || !list.users || list.users.length === 0) break;
      page++;
    }

    // 3) If account exists but admins.user_id is null, sync it
    if (hasAccount && foundUserId) {
      await supabaseAdmin
        .from("admins")
        .update({ user_id: foundUserId })
        .eq("email", adminEmail)
        .is("user_id", null);
    }

    return new Response(
      JSON.stringify({ exists: true, hasAccount, email: adminEmail }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in check-admin-exists:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
