import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { brand } from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteTherapistRequest {
  therapistId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  hotelIds: string[];
}

serve(async (req: Request): Promise<Response> => {
  console.log("=== invite-therapist function called ===");
  console.log("Method:", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured!");
      return new Response(
        JSON.stringify({ error: 'Server configuration error', details: 'Email service not configured' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ---- Caller authentication (admin only) ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No auth header' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    let userId: string;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token - expected 3 parts');
      const payload = JSON.parse(atob(parts[1]));
      userId = payload.sub;
      if (!userId) throw new Error('No sub in token - this may be an anon key, not a user session token');
    } catch (e: any) {
      console.error('Failed to decode token:', e?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication', details: e?.message || 'Invalid or malformed token' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl ?? "", serviceRoleKey ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required', details: roleError?.message || 'User does not have admin role' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { therapistId, email, firstName, lastName, phone, countryCode, hotelIds }: InviteTherapistRequest = await req.json();
    console.log(`Inviting therapist: ${email}`);

    // ---- Build app URL ----
    let appUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    if (!appUrl) appUrl = (req.headers.get("origin") || "").replace(/\/$/, "");
    if (!appUrl) {
      const ref = req.headers.get("referer") || "";
      try { appUrl = new URL(ref).origin; } catch (_) { /* ignore */ }
    }
    if (!appUrl) {
      const supabaseHost = Deno.env.get("SUPABASE_URL") || "";
      const projectRef = supabaseHost.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
      if (projectRef) appUrl = `https://${projectRef}.lovableproject.com`;
    }
    const pwaUrl = `${appUrl}/pwa`;
    const onboardingRedirect = `${appUrl}/pwa/onboarding`;

    // ---- Generate invite / magic link ----
    // generateLink({ type: 'invite' }) creates the auth user if it doesn't exist
    // and produces a link that establishes a session when clicked.
    // If the user already exists (e.g. a retry, or created earlier via OTP),
    // we fall back to a magiclink so the user can still open the app.
    const fullPhone = `${countryCode}${phone}`;

    let actionLink = "";
    let authUserId: string | null = null;

    const inviteRes = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: fullPhone,
        },
        redirectTo: onboardingRedirect,
      },
    });

    if (inviteRes.error) {
      console.warn("Invite link error, falling back to magiclink:", inviteRes.error.message);
      const magicRes = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: onboardingRedirect },
      });
      if (magicRes.error) {
        console.error("Magic link fallback also failed:", magicRes.error);
        throw magicRes.error;
      }
      actionLink = magicRes.data.properties.action_link;
      authUserId = magicRes.data.user?.id ?? null;
    } else {
      actionLink = inviteRes.data.properties.action_link;
      authUserId = inviteRes.data.user?.id ?? null;
    }

    // ---- Link therapist row to auth user + ensure role ----
    if (authUserId) {
      const { error: linkError } = await supabaseAdmin
        .from('therapists')
        .update({ user_id: authUserId })
        .eq('id', therapistId);
      if (linkError) {
        console.warn("Could not link therapist to auth user:", linkError.message);
      }

      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: authUserId, role: 'therapist' });
      // Ignore duplicate-role errors (idempotent)
      if (roleInsertError && !roleInsertError.message.toLowerCase().includes('duplicate')) {
        console.warn("Could not insert therapist role:", roleInsertError.message);
      }
    } else {
      console.warn("No auth user id returned from generateLink — therapist row not linked.");
    }

    // ---- Build welcome email ----
    const { data: hotels } = await supabaseAdmin
      .from('hotels')
      .select('id, name')
      .in('id', hotelIds);
    const hotelNames = hotels?.map(h => h.name).join(', ') || 'vos hôtels assignés';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenue sur ${brand.name}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Bienvenue sur ${brand.name}</h1>
            <p style="color: #cccccc; margin: 10px 0 0 0; font-size: 16px;">Accès Thérapeute</p>
          </div>

          <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-top: none;">
            <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
              Bonjour <strong>${firstName} ${lastName}</strong>,
            </p>

            <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
              Vous avez été ajouté(e) en tant que thérapeute pour <strong>${hotelNames}</strong>.
              Bienvenue dans l'équipe ${brand.name} !
            </p>

            <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; margin: 30px 0;">
              <h3 style="margin: 0 0 15px 0; color: #000;">🔐 Activer votre compte</h3>
              <p style="margin: 0 0 10px 0; font-size: 15px; color: #333;">
                Cliquez sur le bouton ci-dessous pour activer votre compte, définir votre mot de passe et terminer la configuration (photo, notifications).
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionLink}" style="background: #000000; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">Activer mon compte</a>
            </div>

            <p style="font-size: 13px; color: #666; margin: 10px 0 0 0; text-align: center;">
              Ou copiez-collez ce lien dans votre navigateur :<br>
              <a href="${actionLink}" style="color: #0066cc; word-break: break-all;">${actionLink}</a>
            </p>

            <p style="font-size: 13px; color: #999; margin: 20px 0 30px 0; padding: 10px 15px; background: #fafafa; border-left: 3px solid #ddd;">
              Ce lien est valable 24 heures. Si vous le laissez expirer, vous pouvez toujours vous connecter avec votre numéro de téléphone <strong>${fullPhone}</strong> sur <a href="${pwaUrl}" style="color: #0066cc;">${pwaUrl}</a> (un code vous sera envoyé par SMS).
            </p>

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
              <strong style="color: #000000;">L'équipe ${brand.name}</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #e5e5e5;">
            <p style="margin: 0;">© ${new Date().getFullYear()} ${brand.legal.companyName}. Tous droits réservés.</p>
            <p style="margin: 10px 0 0 0;">
              <a href="${appUrl}" style="color: #666; text-decoration: none;">${brand.appDomain}</a>
            </p>
          </div>
        </body>
      </html>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: brand.emails.from.default,
        to: [email],
        subject: `Bienvenue sur ${brand.name} - Activez votre compte`,
        html
      })
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const resendData = await resendResponse.json();
    console.log("Invitation email sent:", resendData?.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email d'invitation envoyé avec succès",
        userId: authUserId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in invite-therapist function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
