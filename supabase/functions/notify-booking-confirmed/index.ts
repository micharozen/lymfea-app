import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

// 🧪 TEST MODE - All notifications go to test addresses
const TEST_MODE = true;
const TEST_EMAIL = 'aaron@oomworld.com';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    
    console.log('[notify-booking-confirmed] TEST_MODE:', TEST_MODE, '- Emails to:', TEST_EMAIL);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingId } = await req.json();
    console.log('[notify-booking-confirmed] Processing booking:', bookingId);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-booking-confirmed] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    console.log('[notify-booking-confirmed] Booking found:', booking.booking_id);

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
      `<span style="display:inline-block;background:#f3f4f6;padding:3px 8px;border-radius:4px;margin:2px;font-size:12px;">${t.name} ${t.price}€</span>`
    ).join('');

    // Compact admin/concierge email
    const createEmailHtml = (recipientType: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#000;padding:12px 16px;text-align:center;">
              <span style="color:#fff;font-size:20px;font-weight:bold;">OOM</span>
              <span style="display:inline-block;background:#22c55e;color:#fff;padding:4px 10px;border-radius:10px;font-size:11px;margin-left:10px;">✓ Confirmée</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#dcfce7;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:10px;text-align:center;">
                    <span style="font-size:18px;font-weight:bold;color:#166534;">#${booking.booking_id}</span>
                    <span style="margin:0 8px;color:#16a34a;">·</span>
                    <span style="font-size:14px;color:#166534;">${formattedDate} à ${formattedTime}</span>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr><td style="padding:5px 0;color:#6b7280;width:70px;">Client</td><td style="padding:5px 0;font-weight:500;">${booking.client_first_name} ${booking.client_last_name}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280;">Tél</td><td style="padding:5px 0;">${booking.phone || '-'}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280;">Hôtel</td><td style="padding:5px 0;">${booking.hotel_name || '-'}${booking.room_number ? ` · Ch.${booking.room_number}` : ''}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280;">Coiffeur</td><td style="padding:5px 0;font-weight:600;">${booking.hairdresser_name || '-'}</td></tr>
              </table>
              
              <div style="margin-bottom:8px;">${treatmentsHtml}</div>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f9fafb;padding:8px 12px;border-radius:6px;">
                    <span style="font-size:12px;color:#6b7280;">Total</span>
                    <span style="float:right;font-size:16px;font-weight:bold;">${booking.total_price || 0}€</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">OOM</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Compact client email
    const createClientEmailHtml = () => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#000;padding:12px 16px;text-align:center;">
              <span style="color:#fff;font-size:20px;font-weight:bold;">OOM</span>
              <span style="display:inline-block;background:#22c55e;color:#fff;padding:4px 10px;border-radius:10px;font-size:11px;margin-left:10px;">✓ Confirmé</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;">
              <p style="margin:0 0 12px;font-size:15px;">Bonjour ${booking.client_first_name},</p>
              <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Votre coiffeur est confirmé !</p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:12px;border-right:1px solid #e5e7eb;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Date</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${formattedDate}</p>
                  </td>
                  <td style="padding:12px;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Heure</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${formattedTime}</p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr><td style="padding:5px 0;color:#6b7280;width:70px;">Résa</td><td style="padding:5px 0;font-weight:500;">#${booking.booking_id}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280;">Hôtel</td><td style="padding:5px 0;">${booking.hotel_name || '-'}${booking.room_number ? ` · Ch.${booking.room_number}` : ''}</td></tr>
                <tr><td style="padding:5px 0;color:#6b7280;">Coiffeur</td><td style="padding:5px 0;font-weight:600;color:#22c55e;">${booking.hairdresser_name || '-'}</td></tr>
              </table>
              
              <div style="margin-bottom:12px;">${treatmentsHtml}</div>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;border-radius:6px;">
                <tr>
                  <td style="padding:10px 12px;color:#fff;font-size:12px;">Total</td>
                  <td style="padding:10px 12px;color:#fff;font-size:16px;font-weight:bold;text-align:right;">${booking.total_price || 0}€</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">OOM · Beauty & Wellness</td>
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

    // 1. Send to admins
    const { data: admins } = await supabase
      .from('admins')
      .select('email, first_name, last_name')
      .eq('status', 'Actif');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        const targetEmail = TEST_MODE ? TEST_EMAIL : admin.email;
        try {
          const { error: emailError } = await resend.emails.send({
            from: 'OOM <booking@oomworld.com>',
            to: [targetEmail],
            subject: `${TEST_MODE ? '[TEST] ' : ''}✅ #${booking.booking_id} confirmée · ${booking.hairdresser_name}`,
            html: createEmailHtml('admin'),
          });

          if (emailError) {
            errors.push(`admin:${targetEmail}`);
          } else {
            emailsSent.push(`admin:${targetEmail}`);
          }
        } catch (e) {
          errors.push(`admin:${targetEmail}`);
        }
        if (TEST_MODE) break;
        await delay(600);
      }
    }

    await delay(600);

    // 2. Send to concierges
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
          const targetEmail = TEST_MODE ? TEST_EMAIL : concierge.email;
          try {
            const { error: emailError } = await resend.emails.send({
              from: 'OOM <booking@oomworld.com>',
              to: [targetEmail],
              subject: `${TEST_MODE ? '[TEST] ' : ''}✅ #${booking.booking_id} confirmée · ${booking.hotel_name}`,
              html: createEmailHtml('concierge'),
            });

            if (emailError) {
              errors.push(`concierge:${targetEmail}`);
            } else {
              emailsSent.push(`concierge:${targetEmail}`);
            }
          } catch (e) {
            errors.push(`concierge:${targetEmail}`);
          }
          if (TEST_MODE) break;
          await delay(600);
        }
      }
    }

    await delay(600);

    // 3. Send to client
    if (booking.client_email) {
      const clientEmail = TEST_MODE ? TEST_EMAIL : booking.client_email;
      try {
        const { error: emailError } = await resend.emails.send({
          from: 'OOM <booking@oomworld.com>',
          to: [clientEmail],
          subject: `${TEST_MODE ? '[TEST] ' : ''}✅ Votre RDV est confirmé · ${formattedDate}`,
          html: createClientEmailHtml(),
        });

        if (emailError) {
          errors.push(`client:${clientEmail}`);
        } else {
          emailsSent.push(`client:${clientEmail}`);
        }
      } catch (e) {
        errors.push(`client:${clientEmail}`);
      }
    }

    console.log('[notify-booking-confirmed] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ success: true, emailsSent: emailsSent.length, emails: emailsSent, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-booking-confirmed] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
