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
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${t.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px;">1</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px;">€${(t.price || 0).toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500; font-size: 14px;">€${(t.price || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const subtotal = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
  const vat = hotel?.vat || 0;
  const vatAmount = (subtotal * vat) / 100;
  const totalWithVAT = subtotal + vatAmount;

  const issueDate = new Date(booking.booking_date);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 7);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice #${booking.booking_id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 40px;
          color: #000;
          background: white;
          line-height: 1.5;
          font-size: 14px;
        }
        .invoice-header {
          margin-bottom: 30px;
        }
        .invoice-title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .header-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .header-left, .header-right {
          font-size: 13px;
          line-height: 1.8;
        }
        .header-left strong, .header-right strong {
          font-weight: bold;
          display: inline-block;
          width: 140px;
        }
        .addresses {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        .address-block {
          width: 48%;
        }
        .address-title {
          font-weight: bold;
          margin-bottom: 8px;
          font-size: 14px;
        }
        .address-content {
          font-size: 13px;
          line-height: 1.8;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
        }
        thead {
          background: #000;
          color: white;
        }
        thead th {
          padding: 12px;
          text-align: left;
          font-weight: bold;
          font-size: 13px;
        }
        thead th:nth-child(2),
        thead th:nth-child(3),
        thead th:nth-child(4) {
          text-align: right;
        }
        tbody tr {
          border-bottom: 1px solid #e5e7eb;
        }
        tbody td {
          padding: 12px;
          font-size: 14px;
        }
        tbody td:nth-child(2),
        tbody td:nth-child(3),
        tbody td:nth-child(4) {
          text-align: right;
        }
        .summary-section {
          margin: 40px 0;
          padding: 20px 0;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .summary-row.bold {
          font-weight: bold;
        }
        .signature-section {
          margin: 50px 0;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .signature-box {
          width: 200px;
          text-align: center;
        }
        .signature-line {
          border-top: 1px solid #000;
          margin-top: 60px;
          padding-top: 8px;
          font-size: 12px;
          font-weight: bold;
        }
        .final-summary {
          background: #f9fafb;
          padding: 20px;
          margin: 30px 0;
        }
        .final-summary-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          font-size: 14px;
        }
        .final-summary-row.total {
          font-weight: bold;
          font-size: 16px;
          border-top: 2px solid #000;
          margin-top: 10px;
          padding-top: 15px;
        }
        .notes {
          font-size: 11px;
          color: #666;
          margin: 20px 0;
          line-height: 1.6;
        }
        .payment-details {
          margin-top: 40px;
          background: #f3f4f6;
          padding: 20px;
        }
        .payment-title {
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 15px;
        }
        .payment-row {
          display: flex;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .payment-label {
          font-weight: bold;
          width: 150px;
        }
        .payment-value {
          flex: 1;
        }
      </style>
    </head>
    <body>
      <div class="invoice-header">
        <div class="invoice-title">Invoice</div>
        
        <div class="header-info">
          <div class="header-left">
            <div><strong>Invoice Number</strong>#${booking.booking_id}</div>
            <div><strong>Issue Date</strong>${issueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div><strong>Due Date</strong>${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div class="header-right">
            <div><strong>Room Number</strong>${booking.room_number || 'N/A'}</div>
            <div><strong>Client Name</strong>${booking.client_first_name} ${booking.client_last_name}</div>
          </div>
        </div>
      </div>

      <div class="addresses">
        <div class="address-block">
          <div class="address-title">From Oom paris</div>
          <div class="address-content">
            ${hotel?.address || '38 RUE DE GRENELLE'}<br>
            ${hotel?.postal_code || '75007'} ${hotel?.city || 'Paris'}, ${hotel?.country || 'France'}<br>
            booking@oomhotel.com
          </div>
        </div>
        <div class="address-block" style="text-align: right;">
          <div class="address-title">To ${hotel?.name || 'TEST'}</div>
          <div class="address-content">
            ${hotel?.address || 'Lane 2'}<br>
            ${hotel?.city || 'Dhaka'}, ${hotel?.country || 'Albania'}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Total Price</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${treatmentRows}
        </tbody>
      </table>

      <div class="summary-section">
        <div class="summary-row bold">
          <span>Total Amount Paid by Client (With VAT)</span>
          <span>€${totalWithVAT.toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span>VAT (${vat}% of Total Amount)</span>
          <span>€${vatAmount.toFixed(2)}</span>
        </div>
        <div class="summary-row bold">
          <span>Total Amount (Without VAT)</span>
          <span>€${subtotal.toFixed(2)}</span>
        </div>
      </div>

      <div class="signature-section">
        <div></div>
        <div class="signature-box">
          <div class="signature-line">CLIENT SIGNATURE</div>
        </div>
      </div>

      <div class="final-summary">
        <div class="final-summary-row">
          <span>Subtotal (100% of total amount of without VAT)</span>
          <span>€${subtotal.toFixed(2)}</span>
        </div>
        <div class="final-summary-row">
          <span>VAT (Reverse Charge Applied)</span>
          <span>€${vatAmount.toFixed(2)}</span>
        </div>
        <div class="final-summary-row total">
          <span>Total Amount Due</span>
          <span>€${totalWithVAT.toFixed(2)}</span>
        </div>
      </div>

      <div class="notes">
        <strong>Notes:</strong> VAT is not charged. This is a B2B transaction and subject to the reverse mechanism under Article 196 of the EU VAT directive. 
        Please ensure VAT is accounted for by the recipient of the service. Payment terms (within 30 days of the invoice date)
      </div>

      <div class="payment-details">
        <div class="payment-title">PAYMENT DETAILS</div>
        <div class="payment-row">
          <span class="payment-label">Account Name</span>
          <span class="payment-value">OOM PARIS</span>
        </div>
        <div class="payment-row">
          <span class="payment-label">Bank Name</span>
          <span class="payment-value">BNP PARIBAS</span>
        </div>
        <div class="payment-row">
          <span class="payment-label">IBAN</span>
          <span class="payment-value">FR76 3000 4014 1200 0108 2983 347</span>
        </div>
        <div class="payment-row">
          <span class="payment-label">BIC/SWIFT</span>
          <span class="payment-value">BNPAFRPPXXX</span>
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
