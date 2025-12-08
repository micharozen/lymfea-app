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

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-concierge-room-payment] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    if (booking.payment_method !== 'room') {
      console.log('[notify-concierge-room-payment] Not a room payment, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_room_payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[notify-concierge-room-payment] Room payment detected for booking #', booking.booking_id);

    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price)')
      .eq('booking_id', bookingId);

    const treatments = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return { name: menu?.name || 'Unknown', price: menu?.price || 0 };
    }) || [];

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });

    const formattedTime = booking.booking_time?.substring(0, 5) || '';

    const treatmentsHtml = treatments.map(t => 
      `<span style="display:inline-block;background:#fef3c7;padding:3px 8px;border-radius:4px;margin:2px;font-size:12px;">${t.name} ${t.price}€</span>`
    ).join('');

    // Compact concierge email
    const createConciergeEmailHtml = () => `
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
            <td style="background:#f59e0b;padding:12px 16px;text-align:center;">
              <span style="color:#fff;font-size:20px;font-weight:bold;">OOM</span>
              <span style="display:inline-block;background:#fff;color:#f59e0b;padding:4px 10px;border-radius:10px;font-size:11px;margin-left:10px;font-weight:600;">💳 Facturer chambre</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:16px;">
              <!-- Alert Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:12px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">Chambre ${booking.room_number || 'N/A'}</p>
                    <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#92400e;">${booking.total_price || 0} €</p>
                  </td>
                </tr>
              </table>
              
              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr>
                  <td style="padding:5px 0;color:#6b7280;width:70px;">Résa</td>
                  <td style="padding:5px 0;font-weight:600;">#${booking.booking_id}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Client</td>
                  <td style="padding:5px 0;">${booking.client_first_name} ${booking.client_last_name}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Tél</td>
                  <td style="padding:5px 0;">${booking.phone || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">RDV</td>
                  <td style="padding:5px 0;font-weight:500;">${formattedDate} à ${formattedTime}</td>
                </tr>
              </table>
              
              <!-- Treatments -->
              <div style="margin-bottom:8px;">${treatmentsHtml}</div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">
              OOM · Merci de facturer sur la note du client
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
              subject: `💳 Ch.${booking.room_number} · ${booking.total_price}€ · #${booking.booking_id}`,
              html: createConciergeEmailHtml(),
            });

            if (emailError) {
              console.error(`[notify-concierge-room-payment] Error sending to ${concierge.email}:`, emailError);
              errors.push(concierge.email);
            } else {
              console.log(`[notify-concierge-room-payment] Email sent to: ${concierge.email}`);
              emailsSent.push(concierge.email);
            }
          } catch (e) {
            console.error(`[notify-concierge-room-payment] Exception:`, e);
            errors.push(concierge.email);
          }
        }
      } else {
        console.log('[notify-concierge-room-payment] No active concierges found');
      }
    } else {
      console.log('[notify-concierge-room-payment] No concierges for hotel:', booking.hotel_id);
    }

    console.log('[notify-concierge-room-payment] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ success: true, emailsSent: emailsSent.length, emails: emailsSent, errors: errors.length > 0 ? errors : undefined }),
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
