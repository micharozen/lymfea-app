import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteConciergeRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  hotelIds: string[];
}

// Generate a secure random password
function generatePassword(): string {
  const length = 12;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&*';
  const all = uppercase + lowercase + numbers + special;
  
  let password = '';
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
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

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify admin role
    const { data: roles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }), 
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { email, firstName, lastName, phone, countryCode, hotelIds }: InviteConciergeRequest = await req.json();

    console.log(`Inviting concierge: ${email}`);

    // Build login URL preferring explicit SITE_URL (production), then origin/referer, then projectRef
    let appUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    if (!appUrl) {
      appUrl = (req.headers.get("origin") || "").replace(/\/$/, "");
    }
    if (!appUrl) {
      const ref = req.headers.get("referer") || "";
      try { appUrl = new URL(ref).origin; } catch (_) { /* ignore */ }
    }
    if (!appUrl) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
      if (projectRef) appUrl = `https://${projectRef}.lovableproject.com`;
    }
    const loginUrl = `${appUrl}/login`;


    // Generate a secure password
    const generatedPassword = generatePassword();
    console.log(`Generated password for ${email}`);

    // Create the user with the generated password
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw createError;
    }

    console.log("User created successfully:", userData.user?.id);

    // Get hotel names for email
    const { data: hotels } = await supabaseAdmin
      .from('hotels')
      .select('id, name')
      .in('id', hotelIds);

    const hotelNames = hotels?.map(h => h.name).join(', ') || '';

    // Send email with login credentials
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "OOM App <booking@oomworld.com>",
        to: [email],
        subject: "Bienvenue sur OOM App - Accès Concierge",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Bienvenue sur OOM App</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI be', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Bienvenue sur OOM App</h1>
                <p style="color: #cccccc; margin: 10px 0 0 0; font-size: 16px;">Accès Concierge</p>
              </div>
              
              <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
                  Bonjour <strong>${firstName} ${lastName}</strong>,
                </p>
                
                <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
                  Vous avez été invité(e) en tant que concierge pour ${hotelNames}. Voici vos identifiants de connexion :
                </p>

                <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; margin: 30px 0;">
                  <p style="margin: 0 0 15px 0;"><strong>URL:</strong> <a href="${loginUrl}" style="color: #0066cc;">${loginUrl}</a></p>
                  <p style="margin: 0 0 15px 0;"><strong>Email:</strong> ${email}</p>
                  <p style="margin: 0;"><strong>Mot de passe:</strong> ${generatedPassword}</p>
                </div>

                <div style="text-align: center; margin: 35px 0;">
                  <a href="${loginUrl}" style="background: #000000; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">Se connecter</a>
                </div>

                <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 25px 0;">
                  <p style="margin: 0; font-size: 14px; color: #856404;">
                    <strong>⚠️ Important:</strong> Vous aurez accès uniquement aux réservations et données concernant vos hôtels.
                  </p>
                </div>

                <p style="font-size: 14px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                  Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.
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
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const resendData = await resendResponse.json();
    console.log("Email sent successfully:", resendData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Invitation envoyée avec succès",
        userId: userData.user?.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in invite-concierge function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});