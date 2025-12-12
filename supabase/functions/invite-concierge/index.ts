import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteConciergeRequest {
  conciergeId: string;
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
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No auth header' }), 
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Extraire le user_id directement depuis le JWT pour éviter les erreurs d'appel Auth
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token');
      const payload = JSON.parse(atob(parts[1]));
      var userId: string | undefined = payload.sub;
      console.log('Decoded user id:', userId);
      if (!userId) throw new Error('No sub in token');
    } catch (e: any) {
      console.error('Failed to decode token:', e?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication', details: 'Invalid or malformed token' }), 
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
      .eq('user_id', userId as string)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }), 
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { conciergeId, email, firstName, lastName, phone, countryCode, hotelIds }: InviteConciergeRequest = await req.json();

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

    // Helper to find existing user by email
    async function findUserByEmail(emailToFind: string): Promise<string | null> {
      let page = 1;
      const perPage = 200;
      while (page <= 10) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) {
          console.error('listUsers error:', error.message);
          break;
        }
        const match = data.users?.find(u => (u.email || '').toLowerCase() === emailToFind.toLowerCase());
        if (match) return match.id;
        if (!data.users || data.users.length < perPage) break;
        page += 1;
      }
      return null;
    }

    // Check if user already exists
    const existingUserId = await findUserByEmail(email);
    console.log('Existing user check:', existingUserId ? 'Found' : 'Not found');

    // Variables to track user creation
    let generatedPassword: string = generatePassword();
    let targetUserId: string | null = null;

    // Find or create user - always generate a new password
    if (!existingUserId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
      });
      if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
      }
      targetUserId = created.user?.id || null;
      console.log('User created successfully:', targetUserId);
    } else {
      targetUserId = existingUserId;
      // Update existing user's password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUserId,
        { password: generatedPassword }
      );
      if (updateError) {
        console.error('Error updating user password:', updateError);
        throw updateError;
      }
      console.log('User password updated for existing user:', existingUserId);
    }

    if (!targetUserId) {
      throw new Error('Unable to resolve target user id');
    }

    // Ensure role 'concierge'
    const { error: roleUpsertError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: targetUserId, role: 'concierge' }, { onConflict: 'user_id,role' });
    if (roleUpsertError) {
      console.error('role upsert error:', roleUpsertError.message);
      throw roleUpsertError;
    }

    // Link concierges.user_id and set must_change_password flag
    if (typeof (globalThis as any).structuredClone === 'undefined') {}
    const { error: linkError } = await supabaseAdmin
      .from('concierges')
      .update({ user_id: targetUserId, must_change_password: true })
      .eq('id', conciergeId);
    if (linkError) {
      console.error('concierge link error:', linkError.message);
      // continue; not fatal for email send
    }

    // Email content - always send password
    const { data: hotels } = await supabaseAdmin
      .from('hotels')
      .select('id, name')
      .in('id', hotelIds);
    const hotelNames = hotels?.map(h => h.name).join(', ') || '';

    const html = `
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
    `;

    // Send the email
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: 'OOM App <booking@oomworld.com>', to: [email], subject: 'Accès OOM App', html })
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
        userId: targetUserId 
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