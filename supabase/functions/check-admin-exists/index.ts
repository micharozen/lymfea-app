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
    const cleanedInput = emailOrPhone.replace(/\s+/g, '');
    
    // Check if input is email or phone
    const isEmail = cleanedInput.includes('@');
    
    let query = supabaseAdmin
      .from("admins")
      .select("email, user_id");
    
    if (isEmail) {
      query = query.eq("email", cleanedInput);
    } else {
      // Search by phone number (remove spaces for comparison)
      query = query.or(`phone.eq.${cleanedInput}`);
    }
    
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
        email: admin ? admin.email : null, // Return email for phone-based login
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
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
