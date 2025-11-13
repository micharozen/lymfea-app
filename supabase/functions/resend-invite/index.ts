import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ResendInviteRequest {
  email: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: ResendInviteRequest = await req.json();

    console.log(`Resending invitation to: ${email}`);

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

    // Get admin info from database
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("first_name, last_name, email")
      .eq("email", email)
      .single();

    if (adminError || !admin) {
      console.error("Admin not found:", adminError);
      throw new Error("Admin not found");
    }

    // Build redirect URL
    const appUrl = (Deno.env.get("SITE_URL") || "http://localhost:8080").replace(/\/$/, "");

    // Generate a fresh invite/recovery link
    let actionLink = "";

    const inviteRes = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${appUrl}/auth` },
    });

    if (inviteRes.error) {
      console.warn("Invite link error, trying recovery:", inviteRes.error);
      
      // Fallback to recovery for existing users
      const recoveryRes = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${appUrl}/auth` },
      });

      if (recoveryRes.error) {
        console.error("Error generating recovery link:", recoveryRes.error);
        throw recoveryRes.error;
      }

      actionLink = recoveryRes.data.properties.action_link;
      console.log("Recovery link generated successfully");
    } else {
      actionLink = inviteRes.data.properties.action_link;
      console.log("Invite link generated successfully");
    }

    // Send email with fresh link
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "OOM App <booking@oomworld.com>",
        to: [email],
        subject: "Nouveau lien d'activation - OOM App",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Nouveau lien d'activation</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Nouveau lien d'activation</h1>
              </div>
              
              <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${admin.first_name} ${admin.last_name},</p>
                
                <p style="font-size: 16px; margin-bottom: 20px;">
                  Voici un nouveau lien pour activer votre compte sur OOM App.
                </p>

                <div style="text-align: center; margin: 35px 0;">
                  <a href="${actionLink}" style="background: #000000; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">Définir mon mot de passe</a>
                </div>

                <p style="font-size: 14px; color: #666; margin-top: 30px;">
                  Ou copiez et collez ce lien dans votre navigateur :<br>
                  <a href="${actionLink}" style="color: #0066cc; word-break: break-all;">${actionLink}</a>
                </p>

                <p style="font-size: 14px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                  Ce lien est valable pendant 24 heures. Si vous n'avez pas demandé ce lien, vous pouvez ignorer cet email.
                </p>

                <p style="font-size: 16px; margin-top: 40px; color: #666;">
                  Cordialement,<br>
                  <strong style="color: #000000;">L'équipe OOM App</strong>
                </p>
              </div>

              <div style="text-align: center; margin-top: 30px; padding: 20px; color: #999; font-size: 12px;">
                <p style="margin: 0;">© ${new Date().getFullYear()} OOM World. Tous droits réservés.</p>
              </div>
            </body>
          </html>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Resend API error: ${errorText}`);
    }

    const emailData = await resendResponse.json();
    console.log("Invitation resent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in resend-invite function:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "unknown_error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
