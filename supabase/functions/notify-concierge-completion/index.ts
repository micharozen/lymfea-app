import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * SERVICE COMPLETION REPORT
 * Trigger: When hairdresser finalizes booking (room charge or card payment)
 * Content: Dynamic email based on payment method with clear billing instructions
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
    console.log('[notify-concierge-completion] Processing booking:', bookingId);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-concierge-completion] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    const paymentMethod = booking.payment_method || 'room';
    const isRoomPayment = paymentMethod === 'room';
    const isTapToPay = paymentMethod === 'tap_to_pay';
    
    console.log('[notify-concierge-completion] Processing completion for booking #', booking.booking_id, '- Payment method:', paymentMethod);

    // Get treatments with details
    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price, duration)')
      .eq('booking_id', bookingId);

    const treatments = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return { 
        name: menu?.name || 'Soin', 
        price: menu?.price || 0,
        duration: menu?.duration || 0
      };
    }) || [];

    const treatmentsList = treatments.map(t => `${t.name} (${t.price}€)`).join(', ');

    // Get hotel for VAT and currency
    const { data: hotel } = await supabase
      .from('hotels')
      .select('name, vat, address, city, postal_code, currency')
      .eq('id', booking.hotel_id)
      .single();

    const currency = hotel?.currency || 'EUR';
    const currencySymbol = currency === 'EUR' ? '€' : currency;

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    const formattedDateShort = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    
    // Deep link URL for booking details
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.oomworld.com';
    const bookingDetailsUrl = `${siteUrl}/admin/booking?bookingId=${bookingId}`;

    const formattedTime = booking.booking_time?.substring(0, 5) || '';
    const totalAmount = booking.total_price || 0;
    const roomNumber = booking.room_number || 'N/A';

    const logoUrl = 'https://jpvgfxchupfukverhcgt.supabase.co/storage/v1/object/public/assets/oom-logo-email.png';

    // Dynamic subject based on payment method
    const emailSubject = isRoomPayment
      ? `⚠️ A FACTURER : Rapport prestation - Chambre ${roomNumber}`
      : `✅ TERMINÉ${isTapToPay ? '' : ' (Payé CB)'} : Rapport prestation - Chambre ${roomNumber}`;

    // Generate Invoice PDF HTML
    const generateInvoicePdfHtml = () => {
      const subtotal = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
      const vat = hotel?.vat || 20;
      const vatAmount = (subtotal * vat) / 100;
      const total = subtotal + vatAmount;

      const treatmentRows = treatments.map(t => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${t.name}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${t.duration} min</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${t.price}${currencySymbol}</td>
        </tr>
      `).join('');

      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Facture #${booking.booking_id}</title></head>
<body style="margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;background:#fff;">
  <div style="max-width:600px;margin:0 auto;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #000;">
      <div>
        <div style="font-size:28px;font-weight:700;">OOM</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:24px;font-weight:700;">FACTURE</div>
        <div style="color:#6b7280;font-size:13px;">#${booking.booking_id}</div>
        <div style="color:#6b7280;font-size:13px;">${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
    </div>
    
    <!-- Client & Hotel -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div style="background:#f9fafb;padding:16px;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Facturé à</div>
        <div style="font-weight:600;margin-bottom:4px;">${booking.client_first_name} ${booking.client_last_name}</div>
        <div style="color:#6b7280;font-size:13px;">${booking.phone || '-'}</div>
        ${booking.room_number ? `<div style="color:#6b7280;font-size:13px;">Chambre ${booking.room_number}</div>` : ''}
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Hôtel</div>
        <div style="font-weight:600;margin-bottom:4px;">${hotel?.name || booking.hotel_name || '-'}</div>
        ${hotel?.address ? `<div style="color:#6b7280;font-size:13px;">${hotel.address}</div>` : ''}
        ${hotel?.city ? `<div style="color:#6b7280;font-size:13px;">${hotel.postal_code || ''} ${hotel.city}</div>` : ''}
      </div>
    </div>
    
    <!-- Service Details -->
    <div style="background:#000;color:#fff;padding:16px;border-radius:8px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">Détails prestation</div>
      <div style="font-size:14px;"><strong>Date:</strong> ${formattedDate}</div>
      <div style="font-size:14px;margin-top:4px;"><strong>Heure:</strong> ${formattedTime}</div>
      ${booking.hairdresser_name ? `<div style="font-size:14px;margin-top:4px;"><strong>Coiffeur:</strong> ${booking.hairdresser_name}</div>` : ''}
      <div style="font-size:14px;margin-top:4px;"><strong>Paiement:</strong> ${isRoomPayment ? 'Facturation chambre' : 'Réglé'}</div>
    </div>
    
    <!-- Treatments Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="padding:12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Prestation</th>
          <th style="padding:12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Durée</th>
          <th style="padding:12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Prix</th>
        </tr>
      </thead>
      <tbody>
        ${treatmentRows}
        <tr style="background:#fafafa;">
          <td colspan="2" style="padding:10px;text-align:right;font-size:13px;">Sous-total</td>
          <td style="padding:10px;text-align:right;font-size:13px;font-weight:500;">${subtotal.toFixed(2)}${currencySymbol}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td colspan="2" style="padding:10px;text-align:right;font-size:13px;color:#6b7280;">TVA (${vat}%)</td>
          <td style="padding:10px;text-align:right;font-size:13px;color:#6b7280;">${vatAmount.toFixed(2)}${currencySymbol}</td>
        </tr>
        <tr style="background:#000;color:#fff;">
          <td colspan="2" style="padding:14px;text-align:right;font-size:15px;font-weight:700;">TOTAL</td>
          <td style="padding:14px;text-align:right;font-size:18px;font-weight:700;">${total.toFixed(2)}${currencySymbol}</td>
        </tr>
      </tbody>
    </table>
    
    <!-- Signature if exists -->
    ${booking.client_signature ? `
    <div style="margin-bottom:24px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Signature client</div>
      <div style="background:#fff;padding:12px;border-radius:6px;border:1px solid #e5e7eb;">
        <img src="${booking.client_signature}" alt="Signature" style="max-width:200px;max-height:80px;" />
      </div>
      <div style="margin-top:6px;font-size:11px;color:#6b7280;">
        Signé le ${booking.signed_at ? new Date(booking.signed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
      </div>
    </div>
    ` : ''}
    
    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #e5e7eb;">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px;">Merci d'avoir choisi OOM</div>
      <div style="color:#9ca3af;font-size:12px;">Pour toute question : booking@oomworld.com</div>
    </div>
  </div>
</body>
</html>
      `;
    };

    // Dynamic email content based on payment method
    const createCompletionEmailHtml = () => {
      // Colors and styles based on payment method
      const headerBgColor = isRoomPayment ? '#fef3c7' : '#ecfdf5';
      const headerBorderColor = isRoomPayment ? '#f59e0b' : '#10b981';
      const headerTextColor = isRoomPayment ? '#92400e' : '#047857';
      const badgeColor = isRoomPayment ? '#f59e0b' : '#10b981';
      const badgeText = isRoomPayment ? '⚠️ ACTION REQUISE' : '✅ RÉGLÉ';
      
      // Billing instruction block
      const billingInstruction = isRoomPayment
        ? `
          <!-- ROOM CHARGE - Action Required -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:3px solid #f59e0b;border-radius:12px;margin-bottom:20px;">
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;font-size:14px;color:#92400e;font-weight:700;text-transform:uppercase;">⚠️ ACTION REQUISE</p>
                <p style="margin:12px 0 0;font-size:36px;font-weight:bold;color:#92400e;">${totalAmount} ${currencySymbol}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#b45309;">Chambre ${roomNumber}</p>
                <div style="margin-top:16px;padding:12px;background:#fff;border-radius:8px;border:1px solid #fcd34d;">
                  <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">
                    📋 Merci de poster le montant de <strong>${totalAmount}${currencySymbol}</strong> sur la note de la chambre <strong>${roomNumber}</strong>
                  </p>
                </div>
              </td>
            </tr>
          </table>
        `
        : `
          <!-- PAYMENT RECEIVED - No Action Required -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:3px solid #10b981;border-radius:12px;margin-bottom:20px;">
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;font-size:14px;color:#047857;font-weight:700;text-transform:uppercase;">✅ RÉGLÉ</p>
                <p style="margin:12px 0 0;font-size:36px;font-weight:bold;color:#047857;">${totalAmount} ${currencySymbol}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#059669;">Chambre ${roomNumber}</p>
                <div style="margin-top:16px;padding:12px;background:#fff;border-radius:8px;border:1px solid #a7f3d0;">
                  <p style="margin:0;font-size:14px;color:#047857;font-weight:600;">
                    ℹ️ Le client a déjà réglé.<br/>
                    <strong style="color:#dc2626;">NE PAS DÉBITER LA CHAMBRE</strong>
                  </p>
                </div>
              </td>
            </tr>
          </table>
        `;

      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#fff;padding:20px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:50px;display:block;margin:0 auto 12px;" />
              <span style="display:inline-block;background:${badgeColor};color:#fff;padding:6px 16px;border-radius:16px;font-size:12px;font-weight:700;">${badgeText}</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:24px;">
              <!-- Header Text -->
              <p style="margin:0 0 20px;font-size:16px;color:#111;font-weight:600;text-align:center;">
                La prestation du ${formattedDateShort} à ${formattedTime} est terminée.
              </p>
              
              ${billingInstruction}
              
              <!-- Booking Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Détails de la prestation</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;width:100px;">Réservation</td>
                        <td style="padding:6px 0;font-weight:600;">#${booking.booking_id}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Client</td>
                        <td style="padding:6px 0;">${booking.client_first_name} ${booking.client_last_name}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Chambre</td>
                        <td style="padding:6px 0;font-weight:600;">${roomNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Date & Heure</td>
                        <td style="padding:6px 0;">${formattedDateShort} à ${formattedTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Coiffeur</td>
                        <td style="padding:6px 0;">${booking.hairdresser_name || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Soins</td>
                        <td style="padding:6px 0;">${treatmentsList || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;">Montant</td>
                        <td style="padding:6px 0;font-weight:700;font-size:15px;">${totalAmount} ${currencySymbol}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td align="center">
                    <a href="${bookingDetailsUrl}" style="display:inline-block;background:#000;color:#fff;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
                      Voir les détails →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Attachment Note -->
              <p style="margin:0;padding:12px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#6b7280;text-align:center;">
                📎 La facture détaillée avec signature client est jointe à cet email
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:16px;text-align:center;background:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                OOM · Rapport de prestation automatique
              </p>
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

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // Generate invoice HTML for PDF attachment
    const invoiceHtml = generateInvoicePdfHtml();

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
            // Convert to base64 using TextEncoder (Deno compatible)
            const encoder = new TextEncoder();
            const invoiceBytes = encoder.encode(invoiceHtml);
            const invoiceBase64 = btoa(String.fromCharCode(...invoiceBytes));
            
            const { error: emailError } = await resend.emails.send({
              from: 'OOM <booking@oomworld.com>',
              to: [concierge.email],
              subject: emailSubject,
              html: createCompletionEmailHtml(),
              attachments: [
                {
                  filename: `facture-${booking.booking_id}.html`,
                  content: invoiceBase64,
                  contentType: 'text/html',
                }
              ],
            });

            if (emailError) {
              console.error(`[notify-concierge-completion] Error sending to ${concierge.email}:`, emailError);
              errors.push(concierge.email);
            } else {
              console.log(`[notify-concierge-completion] Completion email sent to: ${concierge.email} (${paymentMethod})`);
              emailsSent.push(concierge.email);
            }
          } catch (e) {
            console.error(`[notify-concierge-completion] Exception:`, e);
            errors.push(concierge.email);
          }
        }
      } else {
        console.log('[notify-concierge-completion] No active concierges found');
      }
    } else {
      console.log('[notify-concierge-completion] No concierges for hotel:', booking.hotel_id);
    }

    console.log('[notify-concierge-completion] Summary - Sent:', emailsSent.length, 'Errors:', errors.length, 'Payment method:', paymentMethod);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent: emailsSent.length, 
        emails: emailsSent, 
        errors: errors.length > 0 ? errors : undefined,
        totalAmount,
        paymentMethod
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-concierge-completion] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
