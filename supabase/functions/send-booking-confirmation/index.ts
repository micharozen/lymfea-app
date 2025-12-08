import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Compact email template - no scrolling needed
function generateBookingConfirmationHtml({
  bookingNumber,
  clientName,
  hotelName,
  roomNumber,
  bookingDate,
  bookingTime,
  treatments,
  totalPrice,
  currency
}: {
  bookingNumber: string;
  clientName: string;
  hotelName: string;
  roomNumber: string;
  bookingDate: string;
  bookingTime: string;
  treatments: string[];
  totalPrice: number;
  currency: string;
}) {
  const treatmentsList = treatments.map(t => `<span style="display:inline-block;background:#f3f4f6;padding:4px 8px;border-radius:4px;margin:2px;font-size:13px;">${t}</span>`).join('');
  
  const logoUrl = 'https://xbkvmrqanoqdqvqwldio.supabase.co/storage/v1/object/public/assets/oom-logo-email.png';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#fff;padding:20px 16px 12px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:60px;display:block;margin:0 auto 12px;" />
              <span style="display:inline-block;background:#22c55e;color:#fff;padding:6px 16px;border-radius:16px;font-size:12px;font-weight:600;">✓ RDV Confirmé</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 8px;font-size:15px;color:#333;">Bonjour ${clientName},</p>
              <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Votre réservation est confirmée. Un coiffeur va vous être assigné sous peu.</p>
              
              <!-- Key Info Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:12px;border-right:1px solid #e5e7eb;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Date</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${bookingDate}</p>
                  </td>
                  <td style="padding:12px;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Time</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${bookingTime}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;width:100px;">Booking</td>
                  <td style="padding:6px 0;font-weight:500;">#${bookingNumber}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">Hotel</td>
                  <td style="padding:6px 0;font-weight:500;">${hotelName}${roomNumber ? ` · Room ${roomNumber}` : ''}</td>
                </tr>
              </table>
              
              <!-- Treatments -->
              <div style="margin-bottom:12px;">
                <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;">Services</p>
                ${treatmentsList}
              </div>
              
              <!-- Total -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;border-radius:8px;">
                <tr>
                  <td style="padding:12px;color:#fff;font-size:13px;">Total</td>
                  <td style="padding:12px;color:#fff;font-size:18px;font-weight:bold;text-align:right;">${totalPrice} ${currency}</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:12px;text-align:center;background:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">OOM World · Beauty & Wellness</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
    
    const {
      email,
      bookingNumber,
      clientName,
      hotelName,
      roomNumber,
      bookingDate,
      bookingTime,
      treatments,
      totalPrice,
      currency
    } = await req.json();

    console.log('Sending booking confirmation email to:', email);

    // Format date for display
    const formattedDate = new Date(bookingDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const html = generateBookingConfirmationHtml({
      bookingNumber,
      clientName,
      hotelName,
      roomNumber,
      bookingDate: formattedDate,
      bookingTime,
      treatments: treatments || [],
      totalPrice,
      currency,
    });

    // Send email to client
    const { data: clientData, error: clientError } = await resend.emails.send({
      from: 'OOM World <bookings@oomworld.com>',
      to: [email],
      subject: `[TEST CLIENT] RDV #${bookingNumber} confirmé - ${hotelName}`,
      html,
    });

    if (clientError) {
      console.error('Error sending client email:', clientError);
      throw clientError;
    }

    console.log('Client email sent successfully:', clientData);

    // Send notification email to booking@oomworld.com
    const { data: adminData, error: adminError } = await resend.emails.send({
      from: 'OOM World <bookings@oomworld.com>',
      to: ['booking@oomworld.com'],
      subject: `[TEST ADMIN] Nouvelle résa #${bookingNumber} - ${hotelName}`,
      html,
    });

    if (adminError) {
      console.error('Error sending admin email:', adminError);
    } else {
      console.log('Admin notification email sent successfully:', adminData);
    }

    return new Response(
      JSON.stringify({ success: true, data: clientData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-booking-confirmation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
