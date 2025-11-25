import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import React from 'https://esm.sh/react@18.3.1';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { renderAsync } from 'https://esm.sh/@react-email/components@0.0.22';
import { BookingConfirmationEmail } from './_templates/booking-confirmation.tsx';

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

    const html = await renderAsync(
      React.createElement(BookingConfirmationEmail, {
        bookingNumber,
        clientName,
        hotelName,
        roomNumber,
        bookingDate: formattedDate,
        bookingTime,
        treatments,
        totalPrice,
        currency,
      })
    );

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
    const adminHtml = await renderAsync(
      React.createElement(BookingConfirmationEmail, {
        bookingNumber,
        clientName,
        hotelName,
        roomNumber,
        bookingDate: formattedDate,
        bookingTime,
        treatments,
        totalPrice,
        currency,
      })
    );

    const { data: adminData, error: adminError } = await resend.emails.send({
      from: 'OOM World <bookings@oomworld.com>',
      to: ['booking@oomworld.com'],
      subject: `New Booking #${bookingNumber} - ${hotelName}`,
      html: adminHtml,
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
