import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * NOTIFICATION TYPE 1: "Prise de RDV" (Immediate)
 * Trigger: When client confirms booking
 * Content: Just an informative alert - no invoice, no billing request
 */
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
    console.log('[notify-concierge-booking] Processing booking:', bookingId);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-concierge-booking] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    // Only notify if payment method is "room"
    if (booking.payment_method !== 'room') {
      console.log('[notify-concierge-booking] Not a room payment, skipping notification');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_room_payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[notify-concierge-booking] Room payment detected for booking #', booking.booking_id);

    // Get treatments
    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name)')
      .eq('booking_id', bookingId);

    const treatmentNames = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return menu?.name || 'Soin';
    }) || ['Soin'];

    const treatmentsList = treatmentNames.join(', ');

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    const formattedTime = booking.booking_time?.substring(0, 5) || '';

    const logoUrl = 'https://xbkvmrqanoqdqvqwldio.supabase.co/storage/v1/object/public/assets/oom-logo-email.png';

    // Informative email - NO billing info
    const createInfoEmailHtml = () => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#fff;padding:16px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:50px;display:block;margin:0 auto 10px;" />
              <span style="display:inline-block;background:#3b82f6;color:#fff;padding:5px 14px;border-radius:14px;font-size:11px;font-weight:600;">📅 Nouvelle réservation</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                Une prestation est prévue pour un client de l'hôtel.
              </p>
              
              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:16px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#1e40af;font-weight:600;">
                      📍 Chambre ${booking.room_number || 'N/A'}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:#1e3a8a;">
                      <strong>${treatmentsList}</strong>
                    </p>
                    <p style="margin:0;font-size:13px;color:#3b82f6;">
                      ${formattedDate} à ${formattedTime}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Client Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
                <tr>
                  <td style="padding:5px 0;color:#6b7280;width:80px;">Client</td>
                  <td style="padding:5px 0;">${booking.client_first_name} ${booking.client_last_name}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Tél</td>
                  <td style="padding:5px 0;">${booking.phone || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Résa</td>
                  <td style="padding:5px 0;font-weight:500;">#${booking.booking_id}</td>
                </tr>
              </table>
              
              <!-- Note -->
              <p style="margin:16px 0 0;padding:12px;background:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280;text-align:center;">
                ℹ️ Ceci est une notification informative. La facturation sera envoyée après la prestation.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">
              OOM · Pour info uniquement
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

    // Get concierges for this hotel
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
        .eq('status', 'active');

      if (concierges && concierges.length > 0) {
        for (const concierge of concierges) {
          try {
            const { error: emailError } = await resend.emails.send({
              from: 'OOM <booking@oomworld.com>',
              to: [concierge.email],
              subject: `📅 RDV prévu · Ch.${booking.room_number || 'N/A'} · ${formattedTime} · #${booking.booking_id}`,
              html: createInfoEmailHtml(),
            });

            if (emailError) {
              console.error(`[notify-concierge-booking] Error sending to ${concierge.email}:`, emailError);
              errors.push(concierge.email);
            } else {
              console.log(`[notify-concierge-booking] Info email sent to: ${concierge.email}`);
              emailsSent.push(concierge.email);
            }
          } catch (e) {
            console.error(`[notify-concierge-booking] Exception:`, e);
            errors.push(concierge.email);
          }
        }
      } else {
        console.log('[notify-concierge-booking] No active concierges found');
      }
    } else {
      console.log('[notify-concierge-booking] No concierges for hotel:', booking.hotel_id);
    }

    console.log('[notify-concierge-booking] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ success: true, emailsSent: emailsSent.length, emails: emailsSent, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-concierge-booking] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
