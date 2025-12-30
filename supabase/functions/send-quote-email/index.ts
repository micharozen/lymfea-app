import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteItem {
  name: string;
  price: number;
  isFixed: boolean;
}

interface SendQuoteEmailRequest {
  bookingId: string;
  quotedPrice: number;
  quotedDuration: number;
  fixedTotal?: number;
  variableTotal?: number;
  fixedItems?: QuoteItem[];
  variableItems?: QuoteItem[];
}

// Generate a secure token for the quote response
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId, quotedPrice, quotedDuration, fixedTotal, variableTotal, fixedItems, variableItems }: SendQuoteEmailRequest = await req.json();
    console.log("Sending quote email for booking:", bookingId, "Total Price:", quotedPrice, "Duration:", quotedDuration, "Fixed:", fixedTotal, "Variable:", variableTotal);

    if (!bookingId) {
      return new Response(
        JSON.stringify({ error: "bookingId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get booking details with treatments
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if client has an email
    if (!booking.client_email) {
      console.error("No client email for booking:", bookingId);
      return new Response(
        JSON.stringify({ error: "Client has no email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get treatment names
    const { data: bookingTreatments } = await supabase
      .from("booking_treatments")
      .select(`
        treatment_menus (
          name
        )
      `)
      .eq("booking_id", bookingId);

    const treatmentNames = bookingTreatments
      ?.map((bt: any) => bt.treatment_menus?.name)
      .filter(Boolean)
      .join(", ") || "Soin sur mesure";

    // Generate secure token for the response links
    const token = generateToken();
    
    // Store the token in the booking (we'll add a quote_token column or use existing fields)
    // For simplicity, we'll use the token in the URL and validate against the booking ID
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.oom-world.com";
    const hotelName = booking.hotel_name || "l'hôtel";

    // Create approve and refuse URLs
    const approveUrl = `${siteUrl}/quote-response?bookingId=${bookingId}&action=approve&token=${token}`;
    const refuseUrl = `${siteUrl}/quote-response?bookingId=${bookingId}&action=refuse&token=${token}`;

    // Store the token for validation in the proper quote_token column
    const { error: tokenError } = await supabase
      .from("bookings")
      .update({ quote_token: token })
      .eq("id", bookingId);

    if (tokenError) {
      console.error("Error storing quote token:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to save quote token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResponse = await resend.emails.send({
      from: "OOM World <notifications@oomworld.com>",
      to: [booking.client_email],
      subject: `Votre devis pour ${treatmentNames} est prêt`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <img src="https://xbkvmrqanoqdqvqwldio.supabase.co/storage/v1/object/public/assets/OOM_logo-secondary-2.png" alt="OOM World" style="height: 40px;">
            </div>
            
            <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 16px 0; text-align: center;">
              Votre devis est prêt
            </h1>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
              Bonjour ${booking.client_first_name},<br>
              L'équipe OOM a estimé votre soin.
            </p>
            
            <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <div style="text-align: center; margin-bottom: 16px;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">Réservation #${booking.booking_id}</p>
              </div>
              
              ${fixedItems && fixedItems.length > 0 ? `
              <div style="margin-bottom: 16px;">
                <p style="color: #059669; font-size: 12px; font-weight: 600; margin: 0 0 8px 0;">✓ Prestations à prix fixe</p>
                ${fixedItems.map((item: QuoteItem) => `
                  <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
                    <span style="color: #374151;">${item.name}</span>
                    <span style="color: #059669; font-weight: 500;">${item.price.toFixed(2)} €</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              
              ${variableItems && variableItems.length > 0 ? `
              <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed #f59e0b;">
                <p style="color: #d97706; font-size: 12px; font-weight: 600; margin: 0 0 8px 0;">📋 Prestations sur devis</p>
                ${variableItems.map((item: QuoteItem) => `
                  <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
                    <span style="color: #374151;">${item.name}</span>
                    <span style="color: #d97706; font-weight: 500;">${item.price.toFixed(2)} €</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              
              <div style="display: flex; justify-content: center; gap: 32px; margin-top: 16px; padding-top: 16px; border-top: 2px solid #e5e7eb;">
                <div style="text-align: center;">
                  <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0;">Prix Total</p>
                  <p style="color: #1f2937; font-size: 28px; font-weight: 700; margin: 0;">${quotedPrice.toFixed(2)} €</p>
                </div>
                <div style="text-align: center;">
                  <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0;">Durée</p>
                  <p style="color: #1f2937; font-size: 28px; font-weight: 700; margin: 0;">${quotedDuration} min</p>
                </div>
              </div>
              
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0; text-align: center;">
                  📅 ${booking.booking_date} à ${booking.booking_time?.substring(0, 5)}<br>
                  🏨 ${hotelName}${booking.room_number ? ` - Chambre ${booking.room_number}` : ''}
                </p>
              </div>
            </div>
            
            <p style="color: #4b5563; font-size: 14px; text-align: center; margin: 0 0 24px 0;">
              Souhaitez-vous confirmer cette réservation ?
            </p>
            
            <div style="text-align: center; margin-bottom: 16px;">
              <a href="${approveUrl}" 
                 style="display: inline-block; background-color: #10b981; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 8px;">
                ✅ Accepter et réserver
              </a>
            </div>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${refuseUrl}" 
                 style="display: inline-block; background-color: #6b7280; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
                ❌ Refuser
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
              Si vous n'avez pas fait cette demande, vous pouvez ignorer cet email.<br>
              OOM World - Luxury Hair Services
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Quote email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Quote email sent to client" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-quote-email:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
