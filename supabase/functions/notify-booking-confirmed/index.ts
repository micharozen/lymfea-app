import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

// 🧪 TEST MODE - All notifications go to test addresses
const TEST_MODE = true;
const TEST_EMAIL = 'aaron@oomworld.com';
const TEST_PHONE = '+33674678293';

// Delay function to respect Resend rate limit (2 req/sec)
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

    // Fetch booking details
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

    // Create email HTML content for admin/concierge
    const createEmailHtml = (recipientType: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; }
          .badge { background: #22c55e; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; display: inline-block; }
          .card { background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .label { color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 16px; font-weight: 500; margin-bottom: 16px; }
          .treatment { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 16px; }
          .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">OOM App</div>
            <p style="margin-top: 8px;"><span class="badge">Réservation Confirmée</span></p>
          </div>
          
          <p>Bonjour,</p>
          <p>${recipientType === 'admin' 
            ? 'Une réservation a été confirmée par un coiffeur.' 
            : 'Une réservation a été confirmée pour votre hôtel.'}</p>
          
          <div class="card">
            <div class="label">Numéro de réservation</div>
            <div class="value">#${booking.booking_id}</div>
            
            <div class="label">Client</div>
            <div class="value">${booking.client_first_name} ${booking.client_last_name}</div>
            
            <div class="label">Téléphone</div>
            <div class="value">${booking.phone || '-'}</div>
            
            <div class="label">Hôtel</div>
            <div class="value">${booking.hotel_name || '-'}</div>
            
            ${booking.room_number ? `
            <div class="label">Chambre</div>
            <div class="value">${booking.room_number}</div>
            ` : ''}
            
            <div class="label">Date & Heure</div>
            <div class="value">${formattedDate} à ${formattedTime}</div>
            
            <div class="label">Coiffeur assigné</div>
            <div class="value">${booking.hairdresser_name || '-'}</div>
          </div>
          
          ${treatments.length > 0 ? `
          <div class="card">
            <div class="label">Prestations</div>
            ${treatments.map(t => `
              <div class="treatment">
                <span>${t.name}</span>
                <span>${t.price}€</span>
              </div>
            `).join('')}
            <div class="total">Total: ${booking.total_price || 0}€</div>
          </div>
          ` : ''}
          
          <div class="footer">
            <p>OOM App - Booking Management</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create email HTML content for client
    const createClientEmailHtml = () => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; padding: 30px 0; }
          .logo { font-size: 28px; font-weight: bold; color: #000; }
          .badge { background: #22c55e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 14px; display: inline-block; margin-top: 16px; }
          .card { background: #ffffff; border-radius: 16px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          .greeting { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
          .intro { color: #6b7280; margin-bottom: 24px; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
          .detail-label { color: #6b7280; font-size: 14px; }
          .detail-value { font-weight: 500; font-size: 14px; text-align: right; }
          .treatments-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #374151; }
          .treatment { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
          .treatment-name { font-size: 14px; }
          .treatment-price { font-size: 14px; font-weight: 500; }
          .total-row { display: flex; justify-content: space-between; padding: 16px 0 0 0; margin-top: 8px; border-top: 2px solid #e5e7eb; }
          .total-label { font-size: 16px; font-weight: 600; }
          .total-value { font-size: 20px; font-weight: bold; color: #000; }
          .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; padding: 20px 0; }
          .highlight-box { background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%); border-radius: 12px; padding: 20px; margin: 16px 0; border-left: 4px solid #000; }
          .highlight-title { font-size: 12px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; letter-spacing: 0.5px; }
          .highlight-value { font-size: 18px; font-weight: 600; color: #000; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">OOM</div>
            <div class="badge">✓ Réservation Confirmée</div>
          </div>
          
          <div class="card">
            <div class="greeting">Bonjour ${booking.client_first_name},</div>
            <div class="intro">Votre rendez-vous a été confirmé. Un coiffeur vous attend !</div>
            
            <div class="highlight-box">
              <div class="highlight-title">Date & Heure</div>
              <div class="highlight-value">${formattedDate} à ${formattedTime}</div>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Numéro de réservation</span>
              <span class="detail-value">#${booking.booking_id}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Hôtel</span>
              <span class="detail-value">${booking.hotel_name || '-'}</span>
            </div>
            
            ${booking.room_number ? `
            <div class="detail-row">
              <span class="detail-label">Chambre</span>
              <span class="detail-value">${booking.room_number}</span>
            </div>
            ` : ''}
            
            <div class="detail-row">
              <span class="detail-label">Votre coiffeur</span>
              <span class="detail-value">${booking.hairdresser_name || '-'}</span>
            </div>
          </div>
          
          ${treatments.length > 0 ? `
          <div class="card">
            <div class="treatments-title">Vos prestations</div>
            ${treatments.map(t => `
              <div class="treatment">
                <span class="treatment-name">${t.name}</span>
                <span class="treatment-price">${t.price}€</span>
              </div>
            `).join('')}
            <div class="total-row">
              <span class="total-label">Total</span>
              <span class="total-value">${booking.total_price || 0}€</span>
            </div>
          </div>
          ` : ''}
          
          <div class="footer">
            <p>Merci de votre confiance.</p>
            <p style="margin-top: 8px;">OOM - Beauty & Wellness</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // 1. Send to all active admins
    const { data: admins } = await supabase
      .from('admins')
      .select('email, first_name, last_name')
      .eq('status', 'Actif');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        const targetEmail = TEST_MODE ? TEST_EMAIL : admin.email;
        try {
          const { error: emailError } = await resend.emails.send({
            from: 'OOM App <booking@oomworld.com>',
            to: [targetEmail],
            subject: `${TEST_MODE ? '[TEST] ' : ''}✅ Réservation #${booking.booking_id} confirmée - ${booking.hotel_name}`,
            html: createEmailHtml('admin'),
          });

          if (emailError) {
            console.error(`[notify-booking-confirmed] Error sending to admin ${targetEmail}:`, emailError);
            errors.push(`admin:${targetEmail}`);
          } else {
            console.log(`[notify-booking-confirmed] Email sent to admin: ${targetEmail} (original: ${admin.email})`);
            emailsSent.push(`admin:${targetEmail}`);
          }
        } catch (e) {
          console.error(`[notify-booking-confirmed] Exception sending to admin ${targetEmail}:`, e);
          errors.push(`admin:${targetEmail}`);
        }
        // En mode test, on n'envoie qu'un seul email
        if (TEST_MODE) break;
        // Delay to respect rate limit
        await delay(600);
      }
    }

    // Delay before next batch
    await delay(600);

    // 2. Send to concierges of this hotel
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
              from: 'OOM App <booking@oomworld.com>',
              to: [targetEmail],
              subject: `${TEST_MODE ? '[TEST] ' : ''}✅ Réservation #${booking.booking_id} confirmée - ${booking.hotel_name}`,
              html: createEmailHtml('concierge'),
            });

            if (emailError) {
              console.error(`[notify-booking-confirmed] Error sending to concierge ${targetEmail}:`, emailError);
              errors.push(`concierge:${targetEmail}`);
            } else {
              console.log(`[notify-booking-confirmed] Email sent to concierge: ${targetEmail} (original: ${concierge.email})`);
              emailsSent.push(`concierge:${targetEmail}`);
            }
          } catch (e) {
            console.error(`[notify-booking-confirmed] Exception sending to concierge ${targetEmail}:`, e);
            errors.push(`concierge:${targetEmail}`);
          }
          // En mode test, on n'envoie qu'un seul email
          if (TEST_MODE) break;
          // Delay to respect rate limit
          await delay(600);
        }
      }
    }

    // Delay before client email
    await delay(600);

    // 3. Send confirmation email to client (if email available)
    if (booking.client_email) {
      const clientEmail = TEST_MODE ? TEST_EMAIL : booking.client_email;
      try {
        const { error: emailError } = await resend.emails.send({
          from: 'OOM <booking@oomworld.com>',
          to: [clientEmail],
          subject: `${TEST_MODE ? '[TEST CLIENT] ' : ''}Votre rendez-vous est confirmé - ${formattedDate}`,
          html: createClientEmailHtml(),
        });

        if (emailError) {
          console.error(`[notify-booking-confirmed] Error sending to client ${clientEmail}:`, emailError);
          errors.push(`client:${clientEmail}`);
        } else {
          console.log(`[notify-booking-confirmed] Email sent to client: ${clientEmail} (original: ${booking.client_email})`);
          emailsSent.push(`client:${clientEmail}`);
        }
      } catch (e) {
        console.error(`[notify-booking-confirmed] Exception sending to client ${clientEmail}:`, e);
        errors.push(`client:${clientEmail}`);
      }
    } else {
      console.log('[notify-booking-confirmed] No client email available, skipping client notification');
    }

    console.log('[notify-booking-confirmed] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent: emailsSent.length,
        emails: emailsSent,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[notify-booking-confirmed] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
