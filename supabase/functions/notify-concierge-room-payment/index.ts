import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingId } = await req.json();
    console.log('[notify-concierge-room-payment] Processing booking:', bookingId);

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-concierge-room-payment] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    // Only proceed if payment method is room
    if (booking.payment_method !== 'room') {
      console.log('[notify-concierge-room-payment] Not a room payment, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_room_payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[notify-concierge-room-payment] Room payment detected for booking #', booking.booking_id);

    // Fetch treatments for this booking
    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price)')
      .eq('booking_id', bookingId);

    const treatments = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return {
        name: menu?.name || 'Unknown',
        price: menu?.price || 0
      };
    }) || [];

    // Format date
    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formattedTime = booking.booking_time?.substring(0, 5) || '';

    // Create email HTML for concierge
    const createConciergeEmailHtml = () => `
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
                      <span style="display: inline-block; background-color: #f59e0b; color: white; padding: 10px 24px; border-radius: 24px; font-size: 14px; font-weight: 600;">💳 Facturation en chambre</span>
                    </div>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 30px;">
                    <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #111;">Action requise</h2>
                    <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280;">Une nouvelle réservation doit être facturée sur la chambre du client.</p>
                    
                    <!-- Alert Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #92400e;">⚠️ À facturer sur la chambre ${booking.room_number || 'N/A'}</p>
                          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #92400e;">${booking.total_price || 0} €</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Date/Time Highlight -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; font-weight: 600;">Date & Heure du RDV</p>
                          <p style="margin: 0; font-size: 20px; font-weight: 600; color: #000;">${formattedDate}</p>
                          <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 600; color: #000;">à ${formattedTime}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Details -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                          <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Numéro de réservation</span>
                          <span style="font-size: 16px; font-weight: 500; color: #111;">#${booking.booking_id}</span>
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
                          <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.phone || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                          <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Chambre</span>
                          <span style="font-size: 20px; font-weight: 700; color: #111;">${booking.room_number || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                          <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Hôtel</span>
                          <span style="font-size: 16px; font-weight: 500; color: #111;">${booking.hotel_name || '-'}</span>
                        </td>
                      </tr>
                    </table>
                    
                    ${treatments.length > 0 ? `
                    <!-- Treatments -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #374151;">Prestations à facturer</p>
                          ${treatments.map(t => `
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                              <tr>
                                <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                  <span style="font-size: 15px; color: #374151;">${t.name}</span>
                                </td>
                                <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
                                  <span style="font-size: 15px; font-weight: 600; color: #374151;">${t.price}€</span>
                                </td>
                              </tr>
                            </table>
                          `).join('')}
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 2px solid #f59e0b; padding-top: 16px;">
                            <tr>
                              <td style="font-size: 18px; font-weight: 600; color: #111;">Total à facturer</td>
                              <td style="text-align: right; font-size: 24px; font-weight: bold; color: #f59e0b;">${booking.total_price || 0}€</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="text-align: center; padding: 30px; background-color: #fafafa; border-top: 1px solid #f0f0f0;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Merci de facturer ce montant sur la chambre du client.</p>
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">OOM - Beauty & Wellness</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // Find concierges for this hotel
    const { data: conciergeHotels } = await supabase
      .from('concierge_hotels')
      .select('concierge_id')
      .eq('hotel_id', booking.hotel_id);

    if (conciergeHotels && conciergeHotels.length > 0) {
      const conciergeIds = conciergeHotels.map(ch => ch.concierge_id);
      
      const { data: concierges } = await supabase
        .from('concierges')
        .select('email, first_name, last_name')
        .in('id', conciergeIds)
        .eq('status', 'Actif');

      if (concierges && concierges.length > 0) {
        for (const concierge of concierges) {
          try {
            const { error: emailError } = await resend.emails.send({
              from: 'OOM <booking@oomworld.com>',
              to: [concierge.email],
              subject: `💳 Facturation chambre #${booking.room_number} - Réservation #${booking.booking_id} - ${booking.total_price}€`,
              html: createConciergeEmailHtml(),
            });

            if (emailError) {
              console.error(`[notify-concierge-room-payment] Error sending to ${concierge.email}:`, emailError);
              errors.push(concierge.email);
            } else {
              console.log(`[notify-concierge-room-payment] Email sent to concierge: ${concierge.email}`);
              emailsSent.push(concierge.email);
            }
          } catch (e) {
            console.error(`[notify-concierge-room-payment] Exception sending to ${concierge.email}:`, e);
            errors.push(concierge.email);
          }
        }
      } else {
        console.log('[notify-concierge-room-payment] No active concierges found for this hotel');
      }
    } else {
      console.log('[notify-concierge-room-payment] No concierges assigned to hotel:', booking.hotel_id);
    }

    console.log('[notify-concierge-room-payment] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent: emailsSent.length,
        emails: emailsSent,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-concierge-room-payment] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
