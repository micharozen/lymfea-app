import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactAdminRequest {
  emailOrPhone: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emailOrPhone }: ContactAdminRequest = await req.json();

    console.log("Sending access request email for:", emailOrPhone);

    const emailResponse = await resend.emails.send({
      from: "OOM Panel <onboarding@resend.dev>",
      to: ["booking@oomworld.com"],
      subject: "Demande d'accès au panel OOM",
      html: `
        <h2>Nouvelle demande d'accès au panel</h2>
        <p><strong>Email ou téléphone :</strong> ${emailOrPhone}</p>
        <p>Cette personne a tenté de se connecter au panel OOM mais n'a pas de compte.</p>
        <p>Veuillez créer un compte si nécessaire.</p>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
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
