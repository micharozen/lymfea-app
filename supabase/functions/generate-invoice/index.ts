import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Security: Escape HTML entities to prevent XSS attacks
const escapeHtml = (unsafe: string | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

interface InvoiceData {
  booking: any;
  treatments: any[];
  hotel: any;
}

const generateInvoiceHTML = (data: InvoiceData): string => {
  const { booking, treatments, hotel } = data;
  
  // Determine document type based on payment method
  const isRoomPayment = booking.payment_method === 'room';
  const documentTitle = isRoomPayment ? 'BON DE PRESTATION' : 'INVOICE';
  const documentTitleShort = isRoomPayment ? 'Bon de Prestation' : 'Invoice';
  const billToLabel = isRoomPayment ? 'Client' : 'Bill To';
  const thankYouMessage = isRoomPayment 
    ? 'Merci d\'avoir choisi OOM' 
    : 'Thank you for choosing OOM';
  const footerNote = isRoomPayment
    ? 'Ce document constitue un justificatif de prestation pour facturation à la chambre.'
    : 'For any inquiries, please contact booking@oomworld.com';
  
  const treatmentRows = treatments.map(t => `
    <tr>
      <td style="padding: 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px;">${escapeHtml(t.name)}</td>
      <td style="padding: 14px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280; font-size: 14px;">${escapeHtml(t.duration)} min</td>
      <td style="padding: 14px; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 500; font-size: 14px;">${escapeHtml(t.price)}€</td>
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
      <title>${documentTitleShort} #${booking.booking_id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 48px;
          color: #111827;
          background: white;
          line-height: 1.6;
        }
        .header { 
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 50px;
          padding-bottom: 30px;
          border-bottom: 2px solid #000;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo {
          width: 48px;
          height: 48px;
          background: #000;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 24px;
        }
        .company-name {
          font-size: 28px;
          font-weight: 700;
          color: #000;
          letter-spacing: -0.5px;
        }
        .invoice-info { text-align: right; }
        .invoice-title {
          font-size: 32px;
          font-weight: 700;
          color: #000;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        .invoice-meta {
          color: #6b7280;
          font-size: 14px;
          margin: 4px 0;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 40px;
        }
        .info-card {
          background: #f9fafb;
          padding: 24px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
        }
        .info-card p {
          margin: 6px 0;
          font-size: 14px;
        }
        .info-card .name {
          font-weight: 600;
          font-size: 16px;
          color: #000;
          margin-bottom: 8px;
        }
        .booking-details {
          background: #000;
          color: white;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 32px;
        }
        .booking-details .section-title {
          color: #9ca3af;
        }
        .booking-details p {
          margin: 10px 0;
          font-size: 15px;
        }
        .booking-details strong {
          color: #d1d5db;
          font-weight: 500;
          margin-right: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 24px;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }
        thead {
          background: #f9fafb;
        }
        th {
          padding: 16px 14px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        .summary-row {
          background: #fafafa;
        }
        .summary-row td {
          padding: 14px;
          font-size: 14px;
          color: #6b7280;
        }
        .total-row {
          background: #000;
          color: white;
        }
        .total-row td {
          padding: 20px 14px;
          font-size: 18px;
          font-weight: 700;
        }
        .footer {
          margin-top: 60px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
        }
        .footer p {
          color: #9ca3af;
          font-size: 13px;
          margin: 6px 0;
        }
        .thank-you {
          font-weight: 600;
          color: #000;
          font-size: 14px;
          margin-bottom: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-section">
          <div class="logo">O</div>
          <div class="company-name">OOM</div>
        </div>
        <div class="invoice-info">
          <div class="invoice-title">${documentTitle}</div>
          <p class="invoice-meta">#${booking.booking_id}</p>
          <p class="invoice-meta">${new Date(booking.booking_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="section-title">${billToLabel}</div>
          <p class="name">${escapeHtml(booking.client_first_name)} ${escapeHtml(booking.client_last_name)}</p>
          <p style="color: #6b7280;">${escapeHtml(booking.phone)}</p>
          ${booking.room_number ? `<p style="color: #6b7280;">Room ${escapeHtml(booking.room_number)}</p>` : ''}
        </div>
        
        <div class="info-card">
          <div class="section-title">Hotel</div>
          <p class="name">${escapeHtml(hotel?.name || booking.hotel_name || 'N/A')}</p>
          ${hotel?.address ? `<p style="color: #6b7280;">${escapeHtml(hotel.address)}</p>` : ''}
          ${hotel?.city ? `<p style="color: #6b7280;">${escapeHtml(hotel.postal_code || '')} ${escapeHtml(hotel.city)}</p>` : ''}
        </div>
      </div>

      <div class="booking-details">
        <div class="section-title">${isRoomPayment ? 'Détails de la Prestation' : 'Service Details'}</div>
        <p>
          <strong>Date:</strong> ${new Date(booking.booking_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p>
          <strong>${isRoomPayment ? 'Heure' : 'Time'}:</strong> ${booking.booking_time.substring(0, 5)}
        </p>
        ${booking.hairdresser_name ? `<p><strong>${isRoomPayment ? 'Coiffeur(se)' : 'Stylist'}:</strong> ${escapeHtml(booking.hairdresser_name)}</p>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>${isRoomPayment ? 'Prestation' : 'Treatment'}</th>
            <th style="text-align: center;">${isRoomPayment ? 'Durée' : 'Duration'}</th>
            <th style="text-align: right;">${isRoomPayment ? 'Prix' : 'Price'}</th>
          </tr>
        </thead>
        <tbody>
          ${treatmentRows}
          <tr class="summary-row">
            <td colspan="2" style="text-align: right; font-weight: 600;">${isRoomPayment ? 'Sous-total' : 'Subtotal'}</td>
            <td style="text-align: right; font-weight: 600;">${subtotal.toFixed(2)}€</td>
          </tr>
          <tr class="summary-row">
            <td colspan="2" style="text-align: right;">TVA (${vat}%)</td>
            <td style="text-align: right;">${vatAmount.toFixed(2)}€</td>
          </tr>
          <tr class="total-row">
            <td colspan="2" style="text-align: right;">TOTAL</td>
            <td style="text-align: right;">${total.toFixed(2)}€</td>
          </tr>
        </tbody>
      </table>

      ${booking.client_signature ? `
      <div style="margin-top: 40px; padding: 24px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div class="section-title">${isRoomPayment ? 'Signature Client' : 'Client Signature'}</div>
        <div style="margin-top: 12px; background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
          <img src="${booking.client_signature}" alt="Signature client" style="max-width: 300px; max-height: 100px;" />
        </div>
        <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">
          ${isRoomPayment ? 'Signé le' : 'Signed on'} ${booking.signed_at ? new Date(booking.signed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
        </p>
      </div>
      ` : ''}

      <div class="footer">
        <p class="thank-you">${thankYouMessage}</p>
        <p>${footerNote}</p>
        <p>${isRoomPayment ? 'Généré le' : 'Generated on'} ${new Date().toLocaleDateString('fr-FR')}</p>
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
