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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emailOrPhone }: CheckAdminRequest = await req.json();

    if (!emailOrPhone) {
      return new Response(
        JSON.stringify({ error: "Email or phone is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking if admin exists:", emailOrPhone);

    // Remove spaces from phone input for comparison
    let cleanedInput = emailOrPhone.replace(/\s+/g, '');
    
    // Check if input is email or phone
    const isEmail = cleanedInput.includes('@');
    
    let query = supabaseAdmin
      .from("admins")
      .select("email, user_id, phone");
    
    if (isEmail) {
      query = query.eq("email", cleanedInput);
      const { data: admin, error: adminError } = await query.maybeSingle();
      
      if (adminError) {
        console.error("Error checking admin:", adminError);
        throw adminError;
      }
      
      console.log("Admin check result:", admin);

      return new Response(
        JSON.stringify({
          exists: !!admin,
          hasAccount: admin ? !!admin.user_id : false,
          email: admin ? admin.email : null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    } else {
      // Phone search: remove leading 0 and spaces for comparison
      const phoneToSearch = cleanedInput.replace(/^0+/, '');
      console.log("Searching for phone:", phoneToSearch);
      
      // Get all admins and search by phone (manual comparison due to formatting)
      const { data: allAdmins, error: adminError } = await supabaseAdmin
        .from("admins")
        .select("email, user_id, phone");
      
      if (adminError) {
        console.error("Error checking admin:", adminError);
        throw adminError;
      }
      
      // Find admin by comparing cleaned phone numbers
      const admin = allAdmins?.find(a => {
        const dbPhone = a.phone.replace(/\s+/g, '').replace(/^0+/, '');
        return dbPhone === phoneToSearch;
      });
      
      console.log("Admin check result:", admin);

      return new Response(
        JSON.stringify({
          exists: !!admin,
          hasAccount: admin ? !!admin.user_id : false,
          email: admin ? admin.email : null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in check-admin-exists function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
