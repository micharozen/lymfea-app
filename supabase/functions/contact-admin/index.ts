import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { brand, EMAIL_LOGO_URL } from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const ContactAdminSchema = z.object({
  emailOrPhone: z.string().trim().min(1).max(255),
});

// HTML escape function to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Generate beautiful email HTML
function generateEmailHtml(emailOrPhone: string): string {
  const adminUrl = `${SITE_URL}/admin/therapists`;
  
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demande d'accès ${brand.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); padding: 30px 40px; text-align: center;">
              <img src="${EMAIL_LOGO_URL}" alt="${brand.name}" width="120" style="display: block; margin: 0 auto 12px auto;" />
              <p style="margin: 0; color: #cccccc; font-size: 14px;">Panel Administrateur</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <!-- Badge -->
              <div style="text-align: center; margin-bottom: 30px;">
                <span style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500;">
                  ⚡ Nouvelle demande d'accès
                </span>
              </div>
              
              <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600; text-align: center;">
                Quelqu'un souhaite accéder au panel
              </h2>
              
              <p style="margin: 0 0 30px 0; color: #666666; font-size: 15px; line-height: 1.6; text-align: center;">
                Une personne a tenté de se connecter au panel ${brand.name} mais n'a pas de compte actif.
              </p>
              
              <!-- Info Box -->
              <div style="background-color: #f8f9fa; border-left: 4px solid #1a1a1a; border-radius: 0 8px 8px 0; padding: 20px; margin-bottom: 30px;">
                <p style="margin: 0 0 8px 0; color: #888888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
                  Identifiant utilisé
                </p>
                <p style="margin: 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">
                  ${emailOrPhone}
                </p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 30px;">
                <a href="${adminUrl}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 500; transition: background-color 0.2s;">
                  Gérer les utilisateurs →
                </a>
              </div>
              
              <p style="margin: 0; color: #999999; font-size: 13px; text-align: center; line-height: 1.5;">
                Si vous reconnaissez cette personne, vous pouvez créer un compte administrateur, concierge ou thérapeute depuis le panel.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                © ${new Date().getFullYear()} ${brand.legal.companyName} • Cet email a été envoyé automatiquement
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

interface ContactAdminRequest {
  emailOrPhone: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Validate input
    const validated = ContactAdminSchema.parse(requestBody);
    const { emailOrPhone } = validated;

    console.log("Sending access request email for:", emailOrPhone);
    
    // Escape HTML to prevent XSS in email content
    const safeEmailOrPhone = escapeHtml(emailOrPhone);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: brand.emails.from.default,
        to: [brand.emails.adminRecipient],
        subject: `🔐 Demande d'accès au panel ${brand.name}`,
        html: generateEmailHtml(safeEmailOrPhone),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      throw new Error(`Resend API error: ${error}`);
    }

    const data = await response.json();
    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in contact-admin function:", error);
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
