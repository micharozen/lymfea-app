import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";

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
    const templateId = "62e91865-7ad4-4d07-8d92-b299c1fc4ba7";

    // ---- Caller authentication (admin only) ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - No auth header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    let userId: string;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Malformed token - expected 3 parts");
      const payload = JSON.parse(atob(parts[1]));
      userId = payload.sub;
      if (!userId) throw new Error("No sub in token - this may be an anon key, not a user session token");
    } catch (e: any) {
      console.error("Failed to decode token:", e?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication", details: e?.message || "Invalid or malformed token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl ?? "", serviceRoleKey ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roles) {
      return new Response(
        JSON.stringify({
          error: "Forbidden - Admin access required",
          details: roleError?.message || "User does not have admin role",
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { therapistId, email, firstName, lastName, phone, countryCode, hotelIds }: InviteTherapistRequest =
      await req.json();
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
      if (supabaseHost.includes("127.0.0.1") || supabaseHost.includes("localhost")) {
        appUrl = "http://localhost:8080";
      } else {
        const projectRef = supabaseHost.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
        if (projectRef) appUrl = `https://${projectRef}.lovableproject.com`;
      }
    }
    const pwaUrl = `${appUrl}/pwa`;
    const onboardingRedirect = `${appUrl}/pwa/onboarding`;

    // ---- Generate invite / magic link ----
    // generateLink({ type: 'invite' }) creates the auth user if it doesn't
    // exist and produces a link that establishes a session when clicked.
    // If the user already exists (e.g. a retry, or created earlier via OTP),
    // fall back to a magiclink so the therapist can still open the app.
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
        .from("therapists")
        .update({ user_id: authUserId })
        .eq("id", therapistId);
      if (linkError) {
        console.warn("Could not link therapist to auth user:", linkError.message);
      }

      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: authUserId, role: "therapist" });
      // Ignore duplicate-role errors (idempotent)
      if (roleInsertError && !roleInsertError.message.toLowerCase().includes("duplicate")) {
        console.warn("Could not insert therapist role:", roleInsertError.message);
      }
    } else {
      console.warn("No auth user id returned from generateLink — therapist row not linked.");
    }

    // ---- Build template variables & send email ----
    const { data: hotels } = await supabaseAdmin
      .from("hotels")
      .select("id, name")
      .in("id", hotelIds);
    const hotelNames = hotels?.map((h) => h.name).join(", ") || "vos hôtels assignés";

    const templateVariables: Record<string, string> = {
      app_name: brand.name,
      brand_name: brand.name,
      first_name: firstName,
      last_name: lastName,
      hotel_names: hotelNames,
      full_phone: fullPhone,
      pwa_url: pwaUrl,
      activation_url: actionLink,
    };

    const result = await sendEmail({
      to: email,
      subject: `Bienvenue sur ${brand.name} — Activez votre compte`,
      templateId,
      templateVariables,
    });

    if (result.error) {
      console.error("Resend API error:", result.error);
      throw new Error(`Failed to send email: ${result.error}`);
    }

    console.log("Invitation email sent:", result.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email d'invitation envoyé avec succès",
        userId: authUserId,
        emailId: result.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("Error in invite-therapist function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
