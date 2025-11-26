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

    // 1) Check both admins and concierges tables
    let userEmail: string | null = null;
    let userRole: string | null = null;
    
    if (isEmail) {
      // Check admins first
      const { data: adminData, error: adminError } = await supabaseAdmin
        .from("admins")
        .select("email, user_id")
        .eq("email", cleaned)
        .maybeSingle();
      if (adminError) throw adminError;
      
      if (adminData) {
        userEmail = adminData.email;
        userRole = "admin";
      } else {
        // Check concierges
        const { data: conciergeData, error: conciergeError } = await supabaseAdmin
          .from("concierges")
          .select("email, user_id")
          .eq("email", cleaned)
          .maybeSingle();
        if (conciergeError) throw conciergeError;
        
        if (conciergeData) {
          userEmail = conciergeData.email;
          userRole = "concierge";
        }
      }
    } else {
      // Normalize phone: remove spaces and leading 0s
      const phoneToSearch = cleaned.replace(/^0+/, "");
      
      // Check admins
      const { data: adminList, error: adminError } = await supabaseAdmin
        .from("admins")
        .select("email, user_id, phone");
      if (adminError) throw adminError;
      
      const adminMatch = adminList?.find((a) => a.phone?.replace(/\s+/g, "").replace(/^0+/, "") === phoneToSearch);
      if (adminMatch) {
        userEmail = adminMatch.email;
        userRole = "admin";
      } else {
        // Check concierges
        const { data: conciergeList, error: conciergeError } = await supabaseAdmin
          .from("concierges")
          .select("email, user_id, phone");
        if (conciergeError) throw conciergeError;
        
        const conciergeMatch = conciergeList?.find((c) => c.phone?.replace(/\s+/g, "").replace(/^0+/, "") === phoneToSearch);
        if (conciergeMatch) {
          userEmail = conciergeMatch.email;
          userRole = "concierge";
        }
      }
    }

    if (!userEmail) {
      // Return generic response without revealing account existence
      return new Response(JSON.stringify({ exists: false }), {
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
      const match = list?.users?.find((u: any) => u.email?.toLowerCase() === userEmail!.toLowerCase());
      if (match) {
        hasAccount = true;
        foundUserId = match.id;
        break;
      }
      if (!list || !list.users || list.users.length === 0) break;
      page++;
    }

    // 3) If account exists but user_id is null, sync it in the appropriate table
    if (hasAccount && foundUserId) {
      if (userRole === "admin") {
        await supabaseAdmin
          .from("admins")
          .update({ user_id: foundUserId })
          .eq("email", userEmail)
          .is("user_id", null);
      } else if (userRole === "concierge") {
        await supabaseAdmin
          .from("concierges")
          .update({ user_id: foundUserId })
          .eq("email", userEmail)
          .is("user_id", null);
      }
    }

    // Return minimal information - only what's needed for login flow
    // Don't reveal account existence details, role, or setup status
    return new Response(
      JSON.stringify({ 
        exists: true, 
        email: userEmail
      }),
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
