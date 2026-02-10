import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyAdminRequest {
  bookingId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId }: NotifyAdminRequest = await req.json();
    console.log("Notifying admin about quote_pending booking:", bookingId);

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

    // Get booking details
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

    // Get admin emails (check both "active" and "Actif" statuses)
    const { data: admins, error: adminsError } = await supabase
      .from("admins")
      .select("email, first_name")
      .or("status.eq.active,status.eq.Actif");

    if (adminsError || !admins || admins.length === 0) {
      console.error("Error fetching admins:", adminsError);
      return new Response(
        JSON.stringify({ error: "No active admins found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const hotelName = booking.hotel_name || "N/A";

    // Send email to all admins
    const emailPromises = admins.map(async (admin: { email: string; first_name: string }) => {
      try {
        const emailResult = await resend.emails.send({
          from: "OOM World <booking@oomworld.com>",
          to: [admin.email],
          subject: `Action requise : Devis à valider (Hôtel ${hotelName})`,
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
                  <img src="https://jpvgfxchupfukverhcgt.supabase.co/storage/v1/object/public/assets/OOM_logo-secondary-2.png" alt="OOM World" style="height: 40px;">
                </div>
                
                <div style="background-color: #fff7ed; border: 2px solid #f97316; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <h2 style="color: #c2410c; margin: 0 0 12px 0; font-size: 18px;">⚠️ Devis en attente de validation</h2>
                  <p style="color: #7c2d12; margin: 0; font-size: 14px;">
                    Une demande "Sur Mesure" a été créée et nécessite votre action pour définir le prix.
                  </p>
                </div>
                
                <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Réservation #${booking.booking_id}</strong></p>
                  <p style="margin: 0 0 8px 0; font-size: 14px;">Client: ${booking.client_first_name} ${booking.client_last_name}</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px;">Hôtel: ${hotelName}</p>
                  <p style="margin: 0; font-size: 14px;">Date: ${booking.booking_date} à ${booking.booking_time?.substring(0, 5)}</p>
                </div>
                
                <div style="text-align: center;">
                  <a href="${siteUrl}/admin/dashboard" 
                     style="display: inline-block; background-color: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                    Définir le prix →
                  </a>
                </div>
                
                <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">
                  OOM World - Luxury Hair Services
                </p>
              </div>
            </body>
            </html>
          `,
        });
        
        // Log full Resend response for debugging
        console.log(`Resend response for ${admin.email}:`, JSON.stringify(emailResult));
        
        if (emailResult.error) {
          console.error(`Resend error for ${admin.email}:`, emailResult.error);
          return { success: false, email: admin.email, error: emailResult.error };
        }
        
        console.log(`Email sent to admin: ${admin.email} | ID: ${emailResult.data?.id}`);
        return { success: true, email: admin.email, id: emailResult.data?.id };
      } catch (emailError) {
        console.error(`Failed to send email to ${admin.email}:`, emailError);
        return { success: false, email: admin.email, error: emailError };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r: { success: boolean }) => r.success).length;

    console.log(`Quote pending notification sent to ${successCount}/${admins.length} admins`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notification sent to ${successCount} admin(s)`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-admin-quote-pending:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
