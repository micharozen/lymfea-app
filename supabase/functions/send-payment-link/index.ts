import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from 'https://esm.sh/resend@4.0.0';
import {
  getPaymentLinkEmailSubject,
  getPaymentLinkEmailHtml,
  PaymentLinkTemplateData
} from '../_shared/payment-link-templates.ts';
import {
  sendWhatsAppTemplate,
  buildPaymentLinkTemplateMessage,
} from '../_shared/whatsapp-meta.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendPaymentLinkRequest {
  bookingId: string;
  language: 'fr' | 'en';
  channels: ('email' | 'whatsapp')[];
  clientEmail?: string;
  clientPhone?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[SEND-PAYMENT-LINK] Starting payment link generation");

    const { bookingId, language, channels, clientEmail, clientPhone } = await req.json() as SendPaymentLinkRequest;

    // Validate required fields
    if (!bookingId || !language || !channels || channels.length === 0) {
      throw new Error("Missing required fields: bookingId, language, and at least one channel required");
    }

    if (!['fr', 'en'].includes(language)) {
      throw new Error("Invalid language. Must be 'fr' or 'en'");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_id,
        client_first_name,
        client_last_name,
        client_email,
        phone,
        room_number,
        booking_date,
        booking_time,
        total_price,
        payment_status,
        status,
        payment_method,
        hotel_id,
        hotel_name
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[SEND-PAYMENT-LINK] Booking fetch error:", bookingError);
      throw new Error(`Booking not found: ${bookingError?.message || 'unknown error'}`);
    }

    // Fetch hotel for currency info
    let hotelCurrency = 'eur';
    if (booking.hotel_id) {
      const { data: hotel } = await supabase
        .from('hotels')
        .select('currency')
        .eq('id', booking.hotel_id)
        .single();
      if (hotel?.currency) {
        hotelCurrency = hotel.currency.toLowerCase();
      }
    }

    // Validate booking can receive payment link
    if (booking.payment_status === 'paid') {
      throw new Error("Booking is already paid");
    }

    if (booking.status === 'cancelled') {
      throw new Error("Cannot send payment link for cancelled booking");
    }

    // Fetch treatments for this booking
    const { data: bookingTreatments, error: treatmentsError } = await supabase
      .from('booking_treatments')
      .select(`
        treatment_menus (
          id,
          name,
          price,
          duration
        )
      `)
      .eq('booking_id', bookingId);

    if (treatmentsError) {
      console.error("[SEND-PAYMENT-LINK] Treatments fetch error:", treatmentsError);
      throw new Error("Failed to fetch treatments");
    }

    const treatments = bookingTreatments?.map(bt => ({
      name: bt.treatment_menus?.name || 'Service',
      price: bt.treatment_menus?.price || 0,
      duration: bt.treatment_menus?.duration
    })) || [];

    // Calculate total from treatments (server-side validation)
    const verifiedTotalPrice = treatments.reduce((sum, t) => sum + t.price, 0);
    const totalPrice = verifiedTotalPrice > 0 ? verifiedTotalPrice : booking.total_price;

    const currency = hotelCurrency;
    const currencySymbol = currency === 'eur' ? '€' : currency.toUpperCase();

    // Determine email and phone
    const email = clientEmail || booking.client_email;
    const phone = clientPhone || booking.phone;

    // Validate channels
    if (channels.includes('email') && !email) {
      throw new Error("Email address required for email channel");
    }

    if (channels.includes('whatsapp') && !phone) {
      throw new Error("Phone number required for WhatsApp channel");
    }

    console.log("[SEND-PAYMENT-LINK] Creating Stripe Payment Link");

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const siteUrl = Deno.env.get("SITE_URL") || "https://oomworld.com";

    // Create product and price for the payment link
    const treatmentNames = treatments.map(t => t.name).join(', ');

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: currency,
          product_data: {
            name: language === 'fr' ? 'Prestations bien-être OOM World' : 'OOM World Wellness Services',
            description: treatmentNames,
          },
          unit_amount: Math.round(totalPrice * 100), // Stripe uses cents
        },
        quantity: 1,
      }],
      metadata: {
        booking_id: booking.id,
        booking_number: booking.booking_id.toString(),
        hotel_id: booking.hotel_id,
        source: 'payment_link',
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${siteUrl}/booking/confirmation/${booking.id}?payment=success`,
        },
      },
    });

    console.log("[SEND-PAYMENT-LINK] Payment link created:", paymentLink.url);

    // Format date for display
    const bookingDate = new Date(booking.booking_date);
    const formattedDate = language === 'fr'
      ? bookingDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : bookingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Prepare template data
    const templateData: PaymentLinkTemplateData = {
      clientName: `${booking.client_first_name} ${booking.client_last_name}`,
      hotelName: booking.hotel_name || 'Hotel',
      roomNumber: booking.room_number || '-',
      bookingDate: formattedDate,
      bookingTime: booking.booking_time,
      bookingNumber: booking.booking_id,
      treatments: treatments,
      totalPrice: totalPrice,
      paymentUrl: paymentLink.url,
      currency: currencySymbol,
    };

    const results: { email?: boolean; whatsapp?: boolean; errors: string[] } = { errors: [] };

    // Send email if requested
    if (channels.includes('email') && email) {
      try {
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

        const emailResult = await resend.emails.send({
          from: 'OOM World <booking@oomworld.com>',
          to: email,
          subject: getPaymentLinkEmailSubject(language, templateData),
          html: getPaymentLinkEmailHtml(language, templateData),
        });

        console.log("[SEND-PAYMENT-LINK] Email sent:", emailResult);
        results.email = true;
      } catch (emailError) {
        console.error("[SEND-PAYMENT-LINK] Email error:", emailError);
        results.errors.push(`Email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`);
      }
    }

    // Send WhatsApp if requested (via Meta WhatsApp Business API)
    if (channels.includes('whatsapp') && phone) {
      try {
        const treatmentsList = treatments.map(t => `• ${t.name}`).join('\n');

        const template = buildPaymentLinkTemplateMessage(
          language,
          templateData.clientName,
          templateData.roomNumber,
          templateData.hotelName,
          templateData.bookingDate,
          templateData.bookingTime,
          templateData.bookingNumber,
          treatmentsList,
          `${totalPrice}${currencySymbol}`,
          paymentLink.url
        );

        const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const whatsappResult = await sendWhatsAppTemplate(formattedPhone, template);

        if (!whatsappResult.success) {
          throw new Error(whatsappResult.error || 'Failed to send WhatsApp');
        }

        console.log("[SEND-PAYMENT-LINK] WhatsApp sent via Meta:", whatsappResult.messageId);
        results.whatsapp = true;
      } catch (whatsappError) {
        console.error("[SEND-PAYMENT-LINK] WhatsApp error:", whatsappError);
        results.errors.push(`WhatsApp: ${whatsappError instanceof Error ? whatsappError.message : 'Unknown error'}`);
      }
    }

    // Update booking with payment link info
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_link_url: paymentLink.url,
        payment_link_sent_at: new Date().toISOString(),
        payment_link_channels: channels.filter(c =>
          (c === 'email' && results.email) || (c === 'whatsapp' && results.whatsapp)
        ),
        payment_link_language: language,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error("[SEND-PAYMENT-LINK] Update error:", updateError);
      // Don't throw, as the links were already sent
    }

    // Determine overall success
    const atLeastOneSuccess = results.email || results.whatsapp;

    if (!atLeastOneSuccess) {
      throw new Error(`Failed to send payment link: ${results.errors.join('; ')}`);
    }

    console.log("[SEND-PAYMENT-LINK] Completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        paymentLinkUrl: paymentLink.url,
        emailSent: results.email || false,
        whatsappSent: results.whatsapp || false,
        errors: results.errors.length > 0 ? results.errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SEND-PAYMENT-LINK] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
