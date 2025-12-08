import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Unified email template matching the client email design
const createAdminEmailHtml = (booking: any, treatments: any[], dashboardUrl: string) => {
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const treatmentsHtml = treatments.length > 0 ? treatments.map(t => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
          <span style="font-size: 15px; color: #374151;">${t.name} (${t.duration || 0}min)</span>
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
          <span style="font-size: 15px; font-weight: 600; color: #374151;">${t.price}€</span>
        </td>
      </tr>
    </table>
  `).join('') : '<p style="color: #6b7280;">Aucune prestation sélectionnée</p>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding: 40px 30px 20px;">
              <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #000;">OOM</h1>
              <div style="margin-top: 16px;">
                <span style="display: inline-block; background-color: #f59e0b; color: white; padding: 10px 24px; border-radius: 24px; font-size: 14px; font-weight: 600;">🔔 Nouvelle Réservation</span>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280;">Une nouvelle demande de réservation a été créée et nécessite votre attention.</p>
              
              <!-- Date/Time Highlight -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; font-weight: 600;">Date & Heure</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 600; color: #000;">${formattedDate}</p>
                    <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 600; color: #000;">à ${booking.booking_time}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Booking Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Numéro de réservation</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">#${booking.booking_id}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Statut</span>
                    <span style="display: inline-block; background-color: #fef3cd; color: #856404; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">${booking.status}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Client</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.client_first_name} ${booking.client_last_name}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Téléphone</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.phone}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Hôtel</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.hotel_name || booking.hotel_id}</span>
                  </td>
                </tr>
                ${booking.room_number ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Chambre</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.room_number}</span>
                  </td>
                </tr>
                ` : ''}
                ${booking.hairdresser_name ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Coiffeur assigné</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.hairdresser_name}</span>
                  </td>
                </tr>
                ` : ''}
              </table>
              
              <!-- Treatments -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #374151;">Prestations demandées</p>
                    ${treatmentsHtml}
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 2px solid #e5e7eb; padding-top: 16px;">
                      <tr>
                        <td style="font-size: 18px; font-weight: 600; color: #111;">Total</td>
                        <td style="text-align: right; font-size: 24px; font-weight: bold; color: #000;">${booking.total_price || 0}€</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Gérer la réservation</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding: 30px; background-color: #fafafa; border-top: 1px solid #f0f0f0;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">OOM World</p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">Beauty & Wellness Services</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

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

    // Get site URL for dashboard link
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.oomworld.com";
    const dashboardUrl = `${siteUrl}/admin/booking`;

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

    // Format treatments
    const treatments = booking.booking_treatments?.map((bt: any) => ({
      name: bt.treatment_menus?.name || 'Unknown',
      price: bt.treatment_menus?.price || 0,
      duration: bt.treatment_menus?.duration || 0
    })) || [];

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

    const emailHtml = createAdminEmailHtml(booking, treatments, dashboardUrl);

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
