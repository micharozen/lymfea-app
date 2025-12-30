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
  const documentNumber = `#${booking.booking_id}`;
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
  
  const treatmentRows = treatments.map(t => `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid #eaeaea; font-size: 14px; color: #333;">${escapeHtml(t.name)}</td>
      <td style="padding: 16px 0; border-bottom: 1px solid #eaeaea; text-align: right; font-size: 14px; color: #333;">${Number(t.price || 0).toFixed(2)} €</td>
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
      <title>Bon de Prestation ${documentNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          padding: 60px;
          color: #333;
          background: white;
          line-height: 1.5;
          font-size: 14px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 60px;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .doc-info {
          text-align: right;
        }
        .doc-title {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .doc-number {
          font-size: 24px;
          font-weight: 600;
          color: #000;
        }
        .meta-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 50px;
          padding-bottom: 30px;
          border-bottom: 1px solid #eaeaea;
        }
        .meta-block {
          flex: 1;
        }
        .meta-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .meta-value {
          font-size: 14px;
          color: #333;
          line-height: 1.6;
        }
        .meta-value strong {
          display: block;
          font-weight: 600;
          margin-bottom: 2px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        thead th {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 0 0 12px 0;
          border-bottom: 1px solid #eaeaea;
          text-align: left;
        }
        thead th:last-child {
          text-align: right;
        }
        .totals {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eaeaea;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .total-row.final {
          font-size: 18px;
          font-weight: 600;
          padding-top: 16px;
          margin-top: 8px;
          border-top: 2px solid #000;
        }
        .signature-section {
          margin-top: 50px;
          padding: 24px;
          background: #fafafa;
          border-radius: 8px;
        }
        .signature-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
        }
        .signature-img {
          background: white;
          padding: 12px;
          border-radius: 4px;
          display: inline-block;
        }
        .signature-date {
          font-size: 12px;
          color: #999;
          margin-top: 8px;
        }
        .footer {
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid #eaeaea;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">OOM</div>
          <div class="doc-info">
            <div class="doc-title">Bon de Prestation</div>
            <div class="doc-number">${documentNumber}</div>
          </div>
        </div>

        <div class="meta-section">
          <div class="meta-block">
            <div class="meta-label">Client</div>
            <div class="meta-value">
              <strong>${escapeHtml(booking.client_first_name)} ${escapeHtml(booking.client_last_name)}</strong>
              ${booking.room_number ? `Chambre ${escapeHtml(booking.room_number)}` : ''}
            </div>
          </div>
          <div class="meta-block">
            <div class="meta-label">Hôtel</div>
            <div class="meta-value">
              <strong>${escapeHtml(hotel?.name || booking.hotel_name || '')}</strong>
              ${hotel?.city || ''}
            </div>
          </div>
          <div class="meta-block">
            <div class="meta-label">Date</div>
            <div class="meta-value">
              <strong>${formattedDate}</strong>
              ${booking.booking_time?.substring(0, 5) || ''}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Prestation</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            ${treatmentRows}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Sous-total</span>
            <span>${subtotal.toFixed(2)} €</span>
          </div>
          <div class="total-row">
            <span>TVA (${vat}%)</span>
            <span>${vatAmount.toFixed(2)} €</span>
          </div>
          <div class="total-row final">
            <span>Total</span>
            <span>${total.toFixed(2)} €</span>
          </div>
        </div>

        ${booking.client_signature ? `
        <div class="signature-section">
          <div class="signature-label">Signature client</div>
          <div class="signature-img">
            <img src="${booking.client_signature}" alt="Signature" style="max-width: 200px; max-height: 80px;" />
          </div>
          <div class="signature-date">
            Signé le ${booking.signed_at ? new Date(booking.signed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
          </div>
        </div>
        ` : ''}

        <div class="footer">
          Merci d'avoir choisi OOM · Ce document constitue un justificatif de prestation
        </div>
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
