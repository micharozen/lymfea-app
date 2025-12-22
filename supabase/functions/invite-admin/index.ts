import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Generate a secure random password
function generatePassword(): string {
  const length = 12;
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%&*";
  const all = uppercase + lowercase + numbers + special;

  let password = "";
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
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return jsonResponse(
        { error: "missing_resend_api_key" },
        500,
      );
    }

    // Verify authentication using the JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // Extract the JWT token from the Authorization header (robust to casing/spacing)
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (!token) {
      console.error("Invalid Authorization header format");
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // Safe debug (no token logged)
    const jwtLooksValid = token.split(".").length === 3;
    console.log("Auth received:", { hasBearer: !!match, jwtLooksValid });

    // Use the service role client to verify the JWT and get the user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Invalid authentication:", userError);
      return jsonResponse({ error: "invalid_authentication" }, 401);
    }

    console.log("Authenticated user:", user.id, user.email);

    // Verify admin role (reuse supabaseAdmin)
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roles) {
      console.error("Forbidden - Admin required:", roleError);
      return jsonResponse({ error: "forbidden" }, 403);
    }

    const { email, firstName, lastName }: InviteAdminRequest = await req.json();

    if (!email?.includes("@")) {
      return jsonResponse({ error: "invalid_email" }, 400);
    }

    console.log("Inviting admin:", email);

    // Build app URL (prefer explicit SITE_URL)
    let appUrl = SITE_URL;
    if (!appUrl) appUrl = (req.headers.get("origin") || "").replace(/\/$/, "");
    if (!appUrl) {
      const ref = req.headers.get("referer") || "";
      try {
        appUrl = new URL(ref).origin;
      } catch (_) {
        /* ignore */
      }
    }

    // IMPORTANT: current login route is /auth
    const loginUrl = `${appUrl}/auth`;

    // Generate a secure password
    const generatedPassword = generatePassword();

    // Try to create the user first
    let userId: string | undefined;
    const { data: userData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });

    if (createError) {
      // If user already exists, update their password and resend email
      const msg = (createError as any)?.message || "";
      const alreadyExists = msg.toLowerCase().includes("already");

      if (alreadyExists) {
        console.log("User already exists, fetching and updating password...");

        // List users to find the existing one
        const { data: usersList, error: listError } =
          await supabaseAdmin.auth.admin.listUsers();

        if (listError) {
          console.error("Error listing users:", listError);
          return jsonResponse(
            { error: "list_users_failed", details: listError.message },
            500,
          );
        }

        const existingUser = usersList.users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase(),
        );

        if (!existingUser) {
          console.error("User said to exist but not found in list");
          return jsonResponse(
            { error: "user_not_found", details: "Conflict but user not found" },
            500,
          );
        }

        userId = existingUser.id;

        // Update user password
        const { error: updateError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: generatedPassword,
            user_metadata: {
              first_name: firstName,
              last_name: lastName,
            },
          });

        if (updateError) {
          console.error("Error updating user password:", updateError);
          return jsonResponse(
            { error: "update_user_failed", details: updateError.message },
            500,
          );
        }

        console.log("User password updated:", userId);
      } else {
        console.error("Error creating user:", createError);
        return jsonResponse(
          { error: "create_user_failed", details: msg },
          500,
        );
      }
    } else {
      userId = userData.user?.id;
      console.log("User created:", userId);
    }

    if (!userId) {
      console.error("Missing userId after create/update");
      return jsonResponse({ error: "missing_user_id" }, 500);
    }

    // Ensure role is set for redirect logic (ADM-003)
    const { error: roleUpsertError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: "admin",
        },
        { onConflict: "user_id,role" },
      );

    if (roleUpsertError) {
      console.error("Error upserting admin role:", roleUpsertError);
      return jsonResponse(
        { error: "role_upsert_failed", details: roleUpsertError.message },
        500,
      );
    }

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
        subject: "Bienvenue sur OOM — Vos identifiants",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Bienvenue sur OOM</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
              <div style="background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5;">
                <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); padding: 26px; text-align: center;">
                  <img src="${appUrl}/images/oom-logo-email-white.png" alt="OOM" width="120" style="display:block;margin:0 auto 10px auto;" />
                  <p style="margin:0;color:#cccccc;font-size:13px;">Invitation administrateur</p>
                </div>

                <div style="padding: 28px; background: #ffffff;">
                  <h2 style="margin: 0 0 10px 0; font-size: 18px;">Bonjour ${firstName || ""} ${lastName || ""},</h2>
                  <p style="margin: 0 0 18px 0; color: #444;">Voici vos identifiants pour accéder au panel OOM :</p>

                  <div style="background: #f8f9fa; padding: 18px; border-radius: 10px; border: 1px solid #e9ecef;">
                    <p style="margin: 0 0 10px 0;"><strong>URL :</strong> <a href="${loginUrl}" style="color:#0b5ed7;">${loginUrl}</a></p>
                    <p style="margin: 0 0 10px 0;"><strong>Email :</strong> ${email}</p>
                    <p style="margin: 0;"><strong>Mot de passe :</strong> ${generatedPassword}</p>
                  </div>

                  <div style="text-align:center;margin:22px 0 8px 0;">
                    <a href="${loginUrl}" style="background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Se connecter</a>
                  </div>

                  <p style="margin: 14px 0 0 0; font-size: 13px; color: #777;">Par sécurité, changez votre mot de passe après la première connexion.</p>
                </div>

                <div style="padding: 16px 22px; background:#f8f9fa; border-top: 1px solid #e5e5e5; text-align:center; color:#888; font-size: 12px;">
                  © ${new Date().getFullYear()} OOM World
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return jsonResponse({ error: "resend_failed", details: errorText }, 502);
    }

    const emailData = await resendResponse.json();
    console.log("Invitation email sent:", emailData);

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("Error in invite-admin function:", error);
    return jsonResponse(
      { error: error?.message || "unknown_error" },
      500,
    );
  }
});

