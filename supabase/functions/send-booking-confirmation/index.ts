import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Treatment {
  name: string;
  price: number | null;
  isPriceOnRequest: boolean;
}

type IncomingTreatment =
  | Treatment
  | string
  | {
      name?: string;
      price?: number | null;
      price_on_request?: boolean;
      priceOnRequest?: boolean;
    };
function generateBookingConfirmationHtml({
  bookingId,
  bookingNumber,
  clientName,
  hotelName,
  roomNumber,
  bookingDate,
  bookingTime,
  treatments,
  totalPrice,
  currency,
  siteUrl,
  isQuotePending,
  venueType = 'hotel'
}: {
  bookingId: string;
  bookingNumber: string;
  clientName: string;
  hotelName: string;
  roomNumber: string;
  bookingDate: string;
  bookingTime: string;
  treatments: Treatment[];
  totalPrice: number;
  currency: string;
  siteUrl: string;
  isQuotePending: boolean;
  venueType?: 'hotel' | 'coworking';
}) {
  // Get venue-specific terminology
  const locationLabel = venueType === 'coworking' ? 'Workspace' : 'Room';
  const venueLabel = venueType === 'coworking' ? 'Location' : 'Hotel';
  // Build treatments list with proper handling for on-quote items
  const safeCurrency = (currency || 'EUR').toUpperCase();
  const treatmentsList = treatments.map(t => {
    const name = t?.name || 'Service';
    const priceDisplay = t.isPriceOnRequest ? 'Sur devis' : `${t.price ?? 0} ${safeCurrency}`;
    const bgColor = t.isPriceOnRequest ? '#fef3c7' : '#f3f4f6';
    const textColor = t.isPriceOnRequest ? '#92400e' : '#374151';
    return `<span style="display:inline-block;background:${bgColor};color:${textColor};padding:4px 8px;border-radius:4px;margin:2px;font-size:13px;">${name} - ${priceDisplay}</span>`;
  }).join('');
  
  const logoUrl = 'https://xbkvmrqanoqdqvqwldio.supabase.co/storage/v1/object/public/assets/oom-logo-email.png';
  const manageBookingUrl = `${siteUrl}/booking/manage/${bookingId}`;
  
  // Status badge styling
  const statusBadge = isQuotePending 
    ? '<span style="display:inline-block;background:#f59e0b;color:#fff;padding:6px 16px;border-radius:16px;font-size:12px;font-weight:600;">⏳ Quote Requested</span>'
    : '<span style="display:inline-block;background:#22c55e;color:#fff;padding:6px 16px;border-radius:16px;font-size:12px;font-weight:600;">✓ Booking Confirmed</span>';
  
  // Message based on status
  const statusMessage = isQuotePending 
    ? "We've received your booking request. We'll send you a quote very soon with the final price for your custom services."
    : "Your booking has been successfully confirmed. A hairdresser will be assigned to your appointment shortly.";

  // Total display
  const hasOnQuoteItems = treatments.some(t => t.isPriceOnRequest);
  const totalDisplay = hasOnQuoteItems 
    ? `<td style="padding:12px;color:#fff;font-size:18px;font-weight:bold;text-align:right;">${totalPrice} ${currency} <span style="font-size:12px;font-weight:normal;">+ quote</span></td>`
    : `<td style="padding:12px;color:#fff;font-size:18px;font-weight:bold;text-align:right;">${totalPrice} ${currency}</td>`;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#fff;padding:20px 16px 12px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:60px;display:block;margin:0 auto 12px;" />
              ${statusBadge}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 8px;font-size:15px;color:#333;">Hello ${clientName},</p>
              <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${statusMessage}</p>
              
              <!-- Key Info Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:12px;border-right:1px solid #e5e7eb;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Date</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${bookingDate}</p>
                  </td>
                  <td style="padding:12px;width:50%;">
                    <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Time</p>
                    <p style="margin:2px 0 0;font-size:14px;font-weight:600;">${bookingTime}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;width:100px;">Booking</td>
                  <td style="padding:6px 0;font-weight:500;">#${bookingNumber}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">${venueLabel}</td>
                  <td style="padding:6px 0;font-weight:500;">${hotelName}${roomNumber ? ` · ${locationLabel} ${roomNumber}` : ''}</td>
                </tr>
              </table>
              
              <!-- Treatments -->
              <div style="margin-bottom:12px;">
                <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;">Services</p>
                ${treatmentsList}
              </div>
              
              <!-- Total -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;border-radius:8px;">
                <tr>
                  <td style="padding:12px;color:#fff;font-size:13px;">Total</td>
                  ${totalDisplay}
                </tr>
              </table>
              
              <!-- Manage Booking Link -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                <tr>
                  <td align="center">
                    <a href="${manageBookingUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;padding:10px 20px;border-radius:8px;font-size:13px;text-decoration:none;font-weight:500;">
                      Manage my booking
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:8px;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;">Free cancellation up to 2h before the appointment</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:12px;text-align:center;background:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">OOM World · Beauty & Wellness</p>
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
      bookingId,
      bookingNumber,
      clientName,
      hotelName,
      roomNumber,
      bookingDate,
      bookingTime,
      treatments,
      totalPrice,
      currency,
      siteUrl: siteUrlFromBody,
      isQuotePending = false,
      venueType = 'hotel'
    } = await req.json();

    console.log('Sending booking confirmation email to:', email, '| isQuotePending:', isQuotePending);

    // Prefer the app URL coming from the checkout metadata/webhook, fallback to env
    const siteUrl =
      (typeof siteUrlFromBody === 'string' && siteUrlFromBody) ||
      Deno.env.get('SITE_URL') ||
      'https://oomworld.com';

    const normalizedTreatments: Treatment[] = (Array.isArray(treatments) ? treatments : []).map(
      (t: IncomingTreatment) => {
        if (typeof t === 'string') {
          return { name: t, price: null, isPriceOnRequest: false };
        }
        return {
          name: (t as any)?.name || 'Service',
          price: (t as any)?.price ?? null,
          isPriceOnRequest: !!((t as any)?.isPriceOnRequest || (t as any)?.priceOnRequest || (t as any)?.price_on_request),
        };
      }
    );

    const normalizedCurrency = (currency || 'EUR').toUpperCase();

    // Format date for display
    const formattedDate = new Date(bookingDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const html = generateBookingConfirmationHtml({
      bookingId,
      bookingNumber,
      clientName,
      hotelName,
      roomNumber,
      bookingDate: formattedDate,
      bookingTime,
      treatments: normalizedTreatments,
      totalPrice,
      currency: normalizedCurrency,
      siteUrl,
      isQuotePending,
      venueType,
    });

    const subjectPrefix = isQuotePending ? 'Quote Request' : 'Booking Confirmed';

    // Send email to client
    const { data: clientData, error: clientError } = await resend.emails.send({
      from: 'OOM World <bookings@oomworld.com>',
      to: [email],
      subject: `${subjectPrefix} #${bookingNumber} - ${hotelName}`,
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
      subject: `[ADMIN] ${subjectPrefix} #${bookingNumber} - ${hotelName}`,
      html,
    });

    if (adminError) {
      console.error('Error sending admin email:', adminError);
    } else {
      console.log('Admin notification email sent successfully:', adminData);
    }

    return new Response(
      JSON.stringify({ success: true, data: clientData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-booking-confirmation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
