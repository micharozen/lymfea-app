import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { brand } from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TreatmentRequestEmailPayload {
  requestId: string;
  treatmentName: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  hotelId: string;
  hotelName: string;
  roomNumber?: string;
  preferredDate?: string;
  preferredTime?: string;
  description?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: TreatmentRequestEmailPayload = await req.json();
    console.log("Received treatment request email payload:", payload);

    const { treatmentName, clientName, clientPhone, clientEmail, hotelName, roomNumber, preferredDate, preferredTime, description } = payload;

    const adminEmail = brand.emails.adminRecipient;
    const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
    const backOfficeLink = `${siteUrl}/admin/bookings`;

    const emailHtml = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #000; padding: 30px; text-align: center;">
            <h1 style="color: #fff; margin: 0;">📋 Nouvelle demande On Request</h1>
          </div>
          <div style="padding: 30px;">
            <p><strong>Soin:</strong> ${treatmentName}</p>
            <p><strong>Client:</strong> ${clientName}</p>
            <p><strong>Téléphone:</strong> <a href="tel:${clientPhone}">${clientPhone}</a></p>
            ${clientEmail ? `<p><strong>Email:</strong> ${clientEmail}</p>` : ''}
            <p><strong>Hôtel:</strong> ${hotelName}</p>
            ${roomNumber ? `<p><strong>Chambre:</strong> ${roomNumber}</p>` : ''}
            ${preferredDate ? `<p><strong>Date souhaitée:</strong> ${preferredDate}</p>` : ''}
            ${preferredTime ? `<p><strong>Heure souhaitée:</strong> ${preferredTime}</p>` : ''}
            ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
            <div style="text-align: center; margin-top: 30px;">
              <a href="${backOfficeLink}" style="background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none;">Gérer cette demande</a>
            </div>
          </div>
        </div>
      </body>
    </html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: brand.emails.from.default,
        to: [adminEmail],
        subject: `📋 Nouvelle demande On Request - ${treatmentName} - ${hotelName}`,
        html: emailHtml,
      }),
    });

    const data = await res.json();
    console.log("Email sent:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
