import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { bookingId } = await req.json();
    
    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Sending admin notification for booking:", bookingId);

    // Get booking details with treatments
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select(`
        *,
        booking_treatments (
          treatment_menus (
            name,
            price,
            duration
          )
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    // Get active admins
    const { data: admins, error: adminsError } = await supabaseClient
      .from("admins")
      .select("email, first_name, last_name")
      .eq("status", "Actif");

    if (adminsError) {
      console.error("Error fetching admins:", adminsError);
      throw adminsError;
    }

    if (!admins || admins.length === 0) {
      console.log("No active admins found");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format treatments list
    const treatmentsList = booking.booking_treatments
      ?.map((bt: any) => `• ${bt.treatment_menus?.name} - ${bt.treatment_menus?.price}€ (${bt.treatment_menus?.duration}min)`)
      .join("<br>") || "Aucune prestation";

    // Format booking date
    const bookingDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .booking-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .booking-info h2 { margin-top: 0; color: #1a1a1a; font-size: 18px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
          .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .info-label { font-weight: 600; color: #666; min-width: 140px; }
          .info-value { color: #333; }
          .treatments { margin-top: 20px; }
          .total { font-size: 20px; font-weight: 700; color: #1a1a1a; text-align: right; margin-top: 20px; padding-top: 20px; border-top: 2px solid #1a1a1a; }
          .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: #fef3cd; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Nouvelle demande de réservation</h1>
          </div>
          <div class="content">
            <p>Une nouvelle demande de réservation a été créée et nécessite votre attention.</p>
            
            <div class="booking-info">
              <h2>Réservation #${booking.booking_id}</h2>
              <div class="info-row">
                <span class="info-label">Statut</span>
                <span class="info-value"><span class="badge">${booking.status}</span></span>
              </div>
              <div class="info-row">
                <span class="info-label">Client</span>
                <span class="info-value">${booking.client_first_name} ${booking.client_last_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Téléphone</span>
                <span class="info-value">${booking.phone}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Hôtel</span>
                <span class="info-value">${booking.hotel_name || booking.hotel_id}</span>
              </div>
              ${booking.room_number ? `
              <div class="info-row">
                <span class="info-label">Chambre</span>
                <span class="info-value">${booking.room_number}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Date</span>
                <span class="info-value">${bookingDate}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Heure</span>
                <span class="info-value">${booking.booking_time}</span>
              </div>
              ${booking.hairdresser_name ? `
              <div class="info-row">
                <span class="info-label">Coiffeur assigné</span>
                <span class="info-value">${booking.hairdresser_name}</span>
              </div>
              ` : ''}
            </div>

            <div class="booking-info treatments">
              <h2>Prestations demandées</h2>
              ${treatmentsList}
              <div class="total">Total: ${booking.total_price || 0}€</div>
            </div>

            <p style="margin-top: 30px;">Connectez-vous au dashboard pour gérer cette réservation.</p>
          </div>
          <div class="footer">
            <p>OOM World - Gestion des réservations</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send emails to all admins
    let emailsSent = 0;
    const errors: string[] = [];

    for (const admin of admins) {
      try {
        const { error: emailError } = await resend.emails.send({
          from: "OOM Reservations <booking@oomworld.com>",
          to: [admin.email],
          subject: `🔔 Nouvelle réservation #${booking.booking_id} - ${booking.hotel_name || booking.hotel_id}`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`Error sending email to ${admin.email}:`, emailError);
          errors.push(`${admin.email}: ${emailError.message}`);
        } else {
          console.log(`✅ Email sent to admin: ${admin.first_name} ${admin.last_name} (${admin.email})`);
          emailsSent++;
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Error sending email to ${admin.email}:`, err);
        errors.push(`${admin.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log(`Admin notification emails sent: ${emailsSent}/${admins.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        totalAdmins: admins.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in notify-admin-new-booking:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
