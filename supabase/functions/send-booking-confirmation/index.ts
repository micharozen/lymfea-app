import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate HTML directly without React to avoid version conflicts
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
  const treatmentsList = treatments.map(t => `<p style="color:#1a1a1a;font-size:15px;line-height:26px;margin:0;">• ${t}</p>`).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif;padding:0;margin:0;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#1a1a1a;padding:40px 0;text-align:center;">
      <p style="color:#ffffff;font-size:48px;font-weight:bold;letter-spacing:4px;margin:0;padding:0;line-height:1;">OOM</p>
      <p style="color:#ffffff;font-size:12px;font-weight:400;letter-spacing:8px;margin:8px 0 0 0;padding:0;">WORLD</p>
    </div>

    <!-- Content -->
    <div style="padding:48px 40px;">
      <h1 style="color:#1a1a1a;font-size:28px;font-weight:700;margin:0 0 24px 0;padding:0;letter-spacing:-0.5px;">Booking Confirmed</h1>
      
      <p style="color:#1a1a1a;font-size:16px;line-height:24px;margin:0 0 16px 0;">
        Dear ${clientName},
      </p>
      
      <p style="color:#525252;font-size:15px;line-height:24px;margin:0 0 32px 0;">
        Your booking has been successfully confirmed. A hairdresser will be assigned to your appointment shortly and you will receive a notification.
      </p>

      <!-- Booking Card -->
      <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;margin:32px 0;">
        <div style="background-color:#1a1a1a;padding:16px 24px;">
          <p style="color:#ffffff;font-size:18px;font-weight:600;margin:0;letter-spacing:0.5px;">Booking #${bookingNumber}</p>
        </div>

        <hr style="border-color:#e5e5e5;border-top:1px solid #e5e5e5;margin:0;">

        <div style="padding:20px 24px;">
          <p style="color:#737373;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Location</p>
          <p style="color:#1a1a1a;font-size:16px;font-weight:600;margin:0 0 4px 0;">${hotelName}</p>
          ${roomNumber ? `<p style="color:#525252;font-size:14px;margin:0;">Room ${roomNumber}</p>` : ''}
        </div>

        <hr style="border-color:#e5e5e5;border-top:1px solid #e5e5e5;margin:0;">

        <div style="padding:20px 24px;">
          <p style="color:#737373;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Date & Time</p>
          <p style="color:#1a1a1a;font-size:16px;font-weight:600;margin:0 0 4px 0;">${bookingDate}</p>
          <p style="color:#525252;font-size:14px;margin:0;">${bookingTime}</p>
        </div>

        <hr style="border-color:#e5e5e5;border-top:1px solid #e5e5e5;margin:0;">

        <div style="padding:20px 24px;">
          <p style="color:#737373;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Services</p>
          ${treatmentsList}
        </div>

        <hr style="border-color:#e5e5e5;border-top:1px solid #e5e5e5;margin:0;">

        <div style="padding:20px 24px;background-color:#f5f5f5;">
          <p style="color:#737373;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Total</p>
          <p style="color:#1a1a1a;font-size:28px;font-weight:700;margin:0;letter-spacing:-0.5px;">${totalPrice} ${currency}</p>
        </div>
      </div>

      <p style="color:#525252;font-size:14px;line-height:22px;margin:32px 0 0 0;text-align:center;">
        We look forward to providing you with an exceptional experience.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:32px 40px;background-color:#fafafa;">
      <hr style="border-color:#e5e5e5;border-top:1px solid #e5e5e5;margin:0 0 24px 0;">
      <p style="color:#1a1a1a;font-size:14px;font-weight:600;text-align:center;margin:0 0 8px 0;">
        OOM World - Premium Hairdressing Services
      </p>
      <p style="color:#737373;font-size:12px;text-align:center;margin:0;">
        Questions? Contact us at booking@oomworld.com
      </p>
    </div>
  </div>
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