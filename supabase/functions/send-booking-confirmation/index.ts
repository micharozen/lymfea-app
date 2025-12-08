import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate HTML using the unified OOM template style
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
  const treatmentsList = treatments.map(t => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
          <span style="font-size: 15px; color: #374151;">${t}</span>
        </td>
      </tr>
    </table>
  `).join('');
  
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
                <span style="display: inline-block; background-color: #22c55e; color: white; padding: 10px 24px; border-radius: 24px; font-size: 14px; font-weight: 600;">✓ Booking Confirmed</span>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #111;">Dear ${clientName},</h2>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280;">Your booking has been received. A hairdresser will be assigned shortly and you will receive a notification.</p>
              
              <!-- Date/Time Highlight -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; font-weight: 600;">Date & Time</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 600; color: #000;">${bookingDate}</p>
                    <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 600; color: #000;">at ${bookingTime}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Booking Number</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">#${bookingNumber}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Hotel</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${hotelName}</span>
                  </td>
                </tr>
                ${roomNumber ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Room</span>
                    <span style="font-size: 16px; font-weight: 500; color: #111;">${roomNumber}</span>
                  </td>
                </tr>
                ` : ''}
              </table>
              
              <!-- Treatments -->
              ${treatments.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #374151;">Services</p>
                    ${treatmentsList}
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 2px solid #e5e7eb; padding-top: 16px;">
                      <tr>
                        <td style="font-size: 18px; font-weight: 600; color: #111;">Total</td>
                        <td style="text-align: right; font-size: 24px; font-weight: bold; color: #000;">${totalPrice} ${currency}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <p style="margin: 24px 0 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                We look forward to providing you with an exceptional experience.
              </p>
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
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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
      subject: `Booking Confirmation #${bookingNumber} - ${hotelName}`,
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
      subject: `New Booking #${bookingNumber} - ${hotelName}`,
      html,
    });

    if (adminError) {
      console.error('Error sending admin email:', adminError);
      // Don't throw - client email already sent
    } else {
      console.log('Admin notification email sent successfully:', adminData);
    }

    return new Response(
      JSON.stringify({ success: true, data: clientData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-booking-confirmation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
