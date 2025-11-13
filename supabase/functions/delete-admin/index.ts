import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DeleteAdminRequest {
  adminId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminId }: DeleteAdminRequest = await req.json();

    console.log(`Deleting admin: ${adminId}`);

    // Initialize Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // First, get the admin to find the user_id
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from("admins")
      .select("user_id, email")
      .eq("id", adminId)
      .single();

    if (fetchError) {
      console.error("Error fetching admin:", fetchError);
      throw fetchError;
    }

    console.log("Admin found:", admin);

    // Delete the admin record from the database
    const { error: deleteAdminError } = await supabaseAdmin
      .from("admins")
      .delete()
      .eq("id", adminId);

    if (deleteAdminError) {
      console.error("Error deleting admin record:", deleteAdminError);
      throw deleteAdminError;
    }

    console.log("Admin record deleted successfully");

    // If the admin has a user_id, delete the auth user
    if (admin.user_id) {
      console.log(`Deleting auth user: ${admin.user_id}`);
      
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(
        admin.user_id
      );

      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
        // Don't throw here - the admin record is already deleted
        // Just log the error
      } else {
        console.log("Auth user deleted successfully");
      }
    } else {
      console.log("No auth user associated with this admin");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin supprimé avec succès"
      }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in delete-admin function:", error);
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
