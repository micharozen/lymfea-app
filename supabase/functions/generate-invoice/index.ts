import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceData {
  booking: any;
  treatments: any[];
  hotel: any;
}

const generateInvoiceHTML = (data: InvoiceData): string => {
  const { booking, treatments, hotel } = data;
  
  const treatmentRows = treatments.map(t => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${t.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${t.duration} min</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${t.price}€</td>
    </tr>
  `).join('');

  const subtotal = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
  const vat = hotel?.vat || 20;
  const vatAmount = (subtotal * vat) / 100;
  const total = subtotal + vatAmount;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice #${booking.booking_id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1f2937; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .logo { font-size: 32px; font-weight: bold; }
        .invoice-info { text-align: right; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background-color: #f9fafb; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
        .total-row { background-color: #f9fafb; font-weight: 600; }
        .total-row td { padding: 16px; border-top: 2px solid #e5e7eb; }
        .client-info, .hotel-info { background-color: #f9fafb; padding: 20px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">OOM App</div>
        <div class="invoice-info">
          <h1 style="margin: 0; font-size: 24px;">INVOICE</h1>
          <p style="margin: 4px 0; color: #6b7280;">Invoice #${booking.booking_id}</p>
          <p style="margin: 4px 0; color: #6b7280;">Date: ${new Date(booking.booking_date).toLocaleDateString('fr-FR')}</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px;">
        <div class="client-info">
          <div class="section-title">CLIENT INFORMATION</div>
          <p style="margin: 8px 0; font-weight: 600;">${booking.client_first_name} ${booking.client_last_name}</p>
          <p style="margin: 4px 0; color: #6b7280;">${booking.phone}</p>
          ${booking.room_number ? `<p style="margin: 4px 0; color: #6b7280;">Room: ${booking.room_number}</p>` : ''}
        </div>
        
        <div class="hotel-info">
          <div class="section-title">HOTEL INFORMATION</div>
          <p style="margin: 8px 0; font-weight: 600;">${hotel?.name || booking.hotel_name || 'N/A'}</p>
          ${hotel?.address ? `<p style="margin: 4px 0; color: #6b7280;">${hotel.address}</p>` : ''}
          ${hotel?.city ? `<p style="margin: 4px 0; color: #6b7280;">${hotel.postal_code || ''} ${hotel.city}</p>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">BOOKING DETAILS</div>
        <p style="margin: 8px 0;">
          <strong>Date:</strong> ${new Date(booking.booking_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p style="margin: 8px 0;">
          <strong>Time:</strong> ${booking.booking_time.substring(0, 5)}
        </p>
        ${booking.hairdresser_name ? `<p style="margin: 8px 0;"><strong>Hair Dresser:</strong> ${booking.hairdresser_name}</p>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Treatment</th>
            <th style="text-align: center;">Duration</th>
            <th style="text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${treatmentRows}
          <tr>
            <td colspan="2" style="padding: 12px; text-align: right; font-weight: 600;">Subtotal</td>
            <td style="padding: 12px; text-align: right; font-weight: 600;">${subtotal.toFixed(2)}€</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px; text-align: right;">VAT (${vat}%)</td>
            <td style="padding: 12px; text-align: right;">${vatAmount.toFixed(2)}€</td>
          </tr>
          <tr class="total-row">
            <td colspan="2" style="text-align: right; font-size: 18px;">TOTAL</td>
            <td style="text-align: right; font-size: 18px;">${total.toFixed(2)}€</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
        <p>Thank you for your business!</p>
        <p>Generated by OOM App - ${new Date().toLocaleDateString('fr-FR')}</p>
      </div>
    </body>
    </html>
  `;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { bookingId } = await req.json();

    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    console.log('Generating invoice for booking:', bookingId);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError) throw bookingError;
    if (!booking) throw new Error('Booking not found');

    // Get treatments
    const { data: bookingTreatments, error: treatmentsError } = await supabase
      .from('booking_treatments')
      .select(`
        treatment_id,
        treatment_menus (
          id,
          name,
          price,
          duration,
          category
        )
      `)
      .eq('booking_id', bookingId);

    if (treatmentsError) throw treatmentsError;

    const treatments = bookingTreatments?.map((bt: any) => {
      const tm = bt.treatment_menus;
      return {
        id: tm.id,
        name: tm.name,
        price: tm.price,
        duration: tm.duration,
        category: tm.category,
      };
    }) || [];

    // Get hotel details
    const { data: hotel } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', booking.hotel_id)
      .single();

    const invoiceHTML = generateInvoiceHTML({ booking, treatments, hotel });

    console.log('Invoice generated successfully');

    return new Response(
      JSON.stringify({ html: invoiceHTML, bookingId: booking.booking_id }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error generating invoice:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
