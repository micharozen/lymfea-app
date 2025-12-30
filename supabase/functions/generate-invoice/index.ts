import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OOM Logo as inline SVG (simplified version)
const OOM_LOGO_SVG = `<svg width="120" height="32" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="6" fill="#000"/>
  <circle cx="16" cy="16" r="8" stroke="#fff" stroke-width="2" fill="none"/>
  <circle cx="16" cy="16" r="3" fill="#fff"/>
  <text x="44" y="24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="700" fill="#000">OOM</text>
</svg>`;

const OOM_LOGO_BASE64 = `data:image/svg+xml;base64,${btoa(OOM_LOGO_SVG)}`;

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
  
  const documentNumber = `#${booking.booking_id}`;
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
  
  const treatmentRows = treatments.map(t => `
    <tr>
      <td class="item-name">${escapeHtml(t.name)}</td>
      <td class="item-price">${Number(t.price || 0).toFixed(2)} €</td>
    </tr>
  `).join('');

  const subtotal = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
  const vat = hotel?.vat || 20;
  const vatAmount = (subtotal * vat) / 100;
  const total = subtotal + vatAmount;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Bon de Prestation ${documentNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 48px;
      color: #1a1a1a;
      background: #fff;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    
    .document {
      max-width: 560px;
      margin: 0 auto;
    }
    
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 48px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e5e5;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .logo-icon {
      width: 36px;
      height: 36px;
      background: #000;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .logo-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .logo-text {
      font-size: 22px;
      font-weight: 700;
      color: #000;
      letter-spacing: -0.5px;
    }
    
    .doc-meta {
      text-align: right;
    }
    
    .doc-type {
      font-size: 10px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 4px;
    }
    
    .doc-number {
      font-size: 20px;
      font-weight: 600;
      color: #000;
    }
    
    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 40px;
    }
    
    .info-block {}
    
    .info-label {
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
    }
    
    .info-value {
      font-size: 14px;
      color: #1a1a1a;
    }
    
    .info-value strong {
      font-weight: 600;
      display: block;
    }
    
    .info-value span {
      color: #666;
      font-size: 13px;
    }
    
    /* Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    
    .items-table thead th {
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 0 0 12px 0;
      border-bottom: 1px solid #e5e5e5;
      text-align: left;
    }
    
    .items-table thead th:last-child {
      text-align: right;
    }
    
    .items-table tbody td {
      padding: 14px 0;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }
    
    .items-table tbody tr:last-child td {
      border-bottom: none;
    }
    
    .item-name {
      font-size: 14px;
      color: #1a1a1a;
    }
    
    .item-price {
      text-align: right;
      font-size: 14px;
      font-weight: 500;
      color: #1a1a1a;
    }
    
    /* Totals */
    .totals {
      border-top: 1px solid #e5e5e5;
      padding-top: 16px;
    }
    
    .total-line {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
      color: #666;
    }
    
    .total-line.grand {
      padding-top: 12px;
      margin-top: 8px;
      border-top: 2px solid #1a1a1a;
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
    }
    
    /* Signature */
    .signature-box {
      margin-top: 40px;
      padding: 20px;
      background: #fafafa;
      border-radius: 8px;
    }
    
    .signature-label {
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 12px;
    }
    
    .signature-image {
      background: #fff;
      padding: 12px;
      border-radius: 6px;
      display: inline-block;
      border: 1px solid #e5e5e5;
    }
    
    .signature-image img {
      max-width: 180px;
      max-height: 60px;
      display: block;
    }
    
    .signature-date {
      margin-top: 8px;
      font-size: 12px;
      color: #999;
    }
    
    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="document">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2"/>
            <circle cx="12" cy="12" r="3" fill="#fff"/>
          </svg>
        </div>
        <div class="logo-text">OOM</div>
      </div>
      <div class="doc-meta">
        <div class="doc-type">Bon de Prestation</div>
        <div class="doc-number">${documentNumber}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-block">
        <div class="info-label">Client</div>
        <div class="info-value">
          <strong>${escapeHtml(booking.client_first_name)} ${escapeHtml(booking.client_last_name)}</strong>
          ${booking.room_number ? `<span>Chambre ${escapeHtml(booking.room_number)}</span>` : ''}
        </div>
      </div>
      <div class="info-block">
        <div class="info-label">Hôtel</div>
        <div class="info-value">
          <strong>${escapeHtml(hotel?.name || booking.hotel_name || '')}</strong>
          <span>${escapeHtml(hotel?.city || '')}</span>
        </div>
      </div>
      <div class="info-block">
        <div class="info-label">Date</div>
        <div class="info-value">
          <strong>${formattedDate}</strong>
          <span>${booking.booking_time?.substring(0, 5) || ''}</span>
        </div>
      </div>
    </div>

    <table class="items-table">
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
      <div class="total-line">
        <span>Sous-total</span>
        <span>${subtotal.toFixed(2)} €</span>
      </div>
      <div class="total-line">
        <span>TVA (${vat}%)</span>
        <span>${vatAmount.toFixed(2)} €</span>
      </div>
      <div class="total-line grand">
        <span>Total</span>
        <span>${total.toFixed(2)} €</span>
      </div>
    </div>

    ${booking.client_signature ? `
    <div class="signature-box">
      <div class="signature-label">Signature client</div>
      <div class="signature-image">
        <img src="${booking.client_signature}" alt="Signature" />
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
</html>`;
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
