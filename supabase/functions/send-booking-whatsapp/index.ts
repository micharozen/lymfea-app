import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      phone,
      bookingNumber,
      clientName,
      hotelName,
      bookingDate,
      bookingTime,
      treatments,
    } = await req.json();

    console.log('Sending WhatsApp to:', phone);

    // Format date for display
    const formattedDate = new Date(bookingDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create WhatsApp message
    const message = `✨ Booking Confirmation - ${brand.name}

Hello ${clientName}!

Your booking has been confirmed:

📍 Hotel: ${hotelName}
📅 Date: ${formattedDate}
🕐 Time: ${bookingTime}
🎯 Booking #: ${bookingNumber}

💆 Services:
${treatments.map((t: string) => `• ${t}`).join('\n')}

We look forward to serving you!

Best regards,
${brand.name} Team`;

    // Send WhatsApp using Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !twilioPhone) {
      throw new Error('Twilio credentials not configured');
    }

    // Format phone numbers for WhatsApp (Twilio requires whatsapp: prefix)
    const fromWhatsApp = `whatsapp:${twilioPhone}`;
    const toWhatsApp = `whatsapp:${phone}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append('From', fromWhatsApp);
    formData.append('To', toWhatsApp);
    formData.append('Body', message);

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio error:', errorText);
      throw new Error(`Twilio error: ${errorText}`);
    }

    const result = await response.json();
    console.log('WhatsApp sent successfully:', result.sid);

    return new Response(
      JSON.stringify({ success: true, messageSid: result.sid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-booking-whatsapp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});