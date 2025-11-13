import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteAdminRequest {
  email: string;
  firstName: string;
  lastName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName }: InviteAdminRequest = await req.json();

    console.log(`Inviting admin: ${email}`);

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

    // Get the app URL for the redirect
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace("xbkvmrqanoqdqvqwldio.supabase.co", "app.oomhotel.com") || "http://localhost:8080";

    // Try to create auth user and send invite email using Supabase's built-in invite
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${appUrl}/auth`,
      }
    );

    // If user already exists, that's okay - we'll just send the welcome email
    if (authError) {
      if (authError.status === 422 && authError.message?.includes("already been registered")) {
        console.log("User already exists, skipping invitation and sending welcome email only");
      } else {
        console.error("Error inviting user:", authError);
        throw authError;
      }
    } else {
      console.log("User invited successfully:", authData);
    }

    // Send custom welcome email with Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "OOM App <booking@oomworld.com>",
        to: [email],
        subject: "Bienvenue sur OOM App - Configurez votre compte",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Bienvenue sur OOM App</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Bienvenue sur OOM App</h1>
              </div>
              
              <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${firstName} ${lastName},</p>
                
                <p style="font-size: 16px; margin-bottom: 20px;">
                  Votre compte administrateur a été créé avec succès sur OOM App. 
                </p>

                <p style="font-size: 16px; margin-bottom: 20px;">
                  Vous avez reçu un email d'invitation séparé avec un lien pour configurer votre mot de passe. 
                  Veuillez vérifier votre boîte de réception (et vos spams) pour cet email d'invitation.
                </p>

                <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 30px 0;">
                  <p style="margin: 0 0 10px 0; font-weight: 600; color: #000000;">Vos informations de connexion :</p>
                  <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
                  <p style="margin: 5px 0; font-size: 14px; color: #666;">Le mot de passe sera défini via le lien d'invitation</p>
                </div>

                <p style="font-size: 16px; margin-bottom: 20px;">
                  Une fois votre mot de passe configuré, vous pourrez accéder à toutes les fonctionnalités de la plateforme OOM.
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
      const error = await resendResponse.text();
      console.error("Resend API error:", error);
      throw new Error(`Resend API error: ${error}`);
    }

    const emailData = await resendResponse.json();
    console.log("Welcome email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin invité avec succès",
        authData,
        emailData 
      }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in invite-admin function:", error);
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
