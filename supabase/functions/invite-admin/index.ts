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

    // Generate an invite link without sending Supabase's default email
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: email,
      options: {
        redirectTo: `${appUrl}/auth`,
      }
    });

    if (linkError) {
      console.error("Error generating invite link:", linkError);
      throw linkError;
    }

    console.log("Invite link generated successfully");

    const inviteLink = linkData.properties.action_link;

    // Send custom email with the invite link
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

                <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 30px 0;">
                  <p style="margin: 0 0 10px 0; font-weight: 600; color: #000000;">Vos informations de connexion :</p>
                  <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
                </div>

                <p style="font-size: 16px; margin-bottom: 20px;">
                  Pour activer votre compte et définir votre mot de passe, cliquez sur le bouton ci-dessous :
                </p>

                <div style="text-align: center; margin: 35px 0;">
                  <a href="${inviteLink}" style="background: #000000; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">Définir mon mot de passe</a>
                </div>

                <p style="font-size: 14px; color: #666; margin-top: 30px;">
                  Ou copiez et collez ce lien dans votre navigateur :<br>
                  <a href="${inviteLink}" style="color: #0066cc; word-break: break-all;">${inviteLink}</a>
                </p>

                <p style="font-size: 14px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                  Ce lien est valable pendant 24 heures. Si vous n'avez pas demandé la création de ce compte, vous pouvez ignorer cet email.
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
    console.log("Invitation email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin invité avec succès",
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

