import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
        from: "OOM App <booking@oomworld.com>",
        to: ["tom@oomworld.com"],
        subject: "Demande d'accès au panel OOM",
        html: `
          <h2>Nouvelle demande d'accès au panel</h2>
          <p><strong>Email ou téléphone :</strong> ${safeEmailOrPhone}</p>
          <p>Cette personne a tenté de se connecter au panel OOM mais n'a pas de compte.</p>
          <p><strong>Note :</strong> Cet email est envoyé à tom@oomworld.com. Pour recevoir les emails sur booking@oomworld.com, veuillez vérifier votre domaine sur resend.com/domains.</p>
        `,
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
