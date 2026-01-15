import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteHairdresserRequest {
  hairdresserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  hotelIds: string[];
}

serve(async (req: Request): Promise<Response> => {
  console.log("=== invite-hairdresser function called ===");
  console.log("Method:", req.method);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if RESEND_API_KEY is configured
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured!");
      return new Response(
        JSON.stringify({ error: 'Server configuration error', details: 'Email service not configured' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    console.log("RESEND_API_KEY configured:", !!RESEND_API_KEY);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    console.log("Auth header present:", !!authHeader);
    console.log("Auth header length:", authHeader?.length || 0);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No auth header' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Decode user_id from JWT
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    console.log("Token length:", token.length);

    let userId: string;
    try {
      const parts = token.split('.');
      console.log("Token parts count:", parts.length);
      if (parts.length !== 3) throw new Error('Malformed token - expected 3 parts');
      const payload = JSON.parse(atob(parts[1]));
      console.log("Token payload keys:", Object.keys(payload).join(', '));
      console.log("Token role:", payload.role);
      userId = payload.sub;
      console.log('Decoded user id:', userId);
      if (!userId) throw new Error('No sub in token - this may be an anon key, not a user session token');
    } catch (e: any) {
      console.error('Failed to decode token:', e?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication', details: e?.message || 'Invalid or malformed token' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("SUPABASE_URL configured:", !!supabaseUrl);
    console.log("SUPABASE_SERVICE_ROLE_KEY configured:", !!serviceRoleKey);

    const supabaseAdmin = createClient(
      supabaseUrl ?? "",
      serviceRoleKey ?? ""
    );

    // Verify admin role
    console.log("Checking admin role for user:", userId);
    const { data: roles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    console.log("Role check result:", roles, "Error:", roleError?.message);

    if (roleError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required', details: roleError?.message || 'User does not have admin role' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { hairdresserId, email, firstName, lastName, phone, countryCode, hotelIds }: InviteHairdresserRequest = await req.json();

    console.log(`Sending welcome email to hairdresser: ${email}`);

    // Build app URL
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
    const pwaUrl = `${appUrl}/pwa`;

    // Get hotel names
    const { data: hotels } = await supabaseAdmin
      .from('hotels')
      .select('id, name')
      .in('id', hotelIds);
    const hotelNames = hotels?.map(h => h.name).join(', ') || 'vos hôtels assignés';

    const fullPhone = `${countryCode}${phone}`;

    const html = `
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
            <p style="color: #cccccc; margin: 10px 0 0 0; font-size: 16px;">Accès Coiffeur</p>
          </div>
          
          <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-top: none;">
            <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
              Bonjour <strong>${firstName} ${lastName}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
              Vous avez été ajouté(e) en tant que coiffeur pour <strong>${hotelNames}</strong>. 
              Bienvenue dans l'équipe OOM !
            </p>

            <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; margin: 30px 0;">
              <h3 style="margin: 0 0 15px 0; color: #000;">🔐 Comment vous connecter</h3>
              <p style="margin: 0 0 10px 0;">Votre numéro de téléphone pour la connexion :</p>
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #000;">${fullPhone}</p>
              <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                Vous recevrez un code par SMS pour vous connecter.
              </p>
            </div>

            <div style="text-align: center; margin: 35px 0;">
              <a href="${pwaUrl}" style="background: #000000; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">Accéder à l'application</a>
            </div>

            <!-- PWA Installation Instructions -->
            <div style="background: #f0f9ff; border: 1px solid #0284c7; border-radius: 8px; padding: 25px; margin: 30px 0;">
              <h3 style="margin: 0 0 20px 0; color: #0369a1; font-size: 18px;">📱 Installer l'application sur votre téléphone</h3>
              
              <div style="margin-bottom: 25px;">
                <h4 style="margin: 0 0 12px 0; color: #333; font-size: 15px;">🍎 Sur iPhone (Safari) :</h4>
                <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                  <li>Ouvrez <a href="${pwaUrl}" style="color: #0284c7;">${pwaUrl}</a> dans <strong>Safari</strong></li>
                  <li>Appuyez sur l'icône <strong>Partager</strong> (carré avec flèche vers le haut) en bas de l'écran</li>
                  <li>Faites défiler et appuyez sur <strong>"Sur l'écran d'accueil"</strong></li>
                  <li>Appuyez sur <strong>"Ajouter"</strong> en haut à droite</li>
                </ol>
              </div>
              
              <div>
                <h4 style="margin: 0 0 12px 0; color: #333; font-size: 15px;">🤖 Sur Android (Chrome) :</h4>
                <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                  <li>Ouvrez <a href="${pwaUrl}" style="color: #0284c7;">${pwaUrl}</a> dans <strong>Chrome</strong></li>
                  <li>Appuyez sur les <strong>trois points</strong> (⋮) en haut à droite</li>
                  <li>Appuyez sur <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong></li>
                  <li>Confirmez en appuyant sur <strong>"Installer"</strong></li>
                </ol>
              </div>
            </div>

            <div style="background: #f0fdf4; border: 1px solid #22c55e; border-radius: 6px; padding: 15px; margin: 25px 0;">
              <p style="margin: 0; font-size: 14px; color: #166534;">
                <strong>✅ Astuce :</strong> Une fois installée, l'application fonctionnera comme une vraie app et vous recevrez des notifications pour les nouvelles réservations !
              </p>
            </div>

            <p style="font-size: 16px; margin-top: 40px; color: #666;">
              Cordialement,<br>
              <strong style="color: #000000;">L'équipe OOM App</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #e5e5e5;">
            <p style="margin: 0;">© ${new Date().getFullYear()} OOM World. Tous droits réservés.</p>
            <p style="margin: 10px 0 0 0;">
              <a href="${appUrl}" style="color: #666; text-decoration: none;">oomworld.com</a>
            </p>
          </div>
        </body>
      </html>
    `;

    // Send the email
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ 
        from: 'OOM App <booking@oomworld.com>', 
        to: [email], 
        subject: 'Bienvenue sur OOM App - Accès Coiffeur', 
        html 
      })
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
        message: "Email de bienvenue envoyé avec succès"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in invite-hairdresser function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
