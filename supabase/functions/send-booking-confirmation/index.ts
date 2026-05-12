import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { brand, EMAIL_LOGO_URL } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";

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
const i18n = {
  fr: {
    statusConfirmed: 'RÉSERVATION CONFIRMÉE',
    statusQuote: 'DEVIS DEMANDÉ',
    greetingConfirmed: `Votre expérience bien-être a bien été confirmée. Nous avons hâte de vous accueillir.`,
    greetingQuote: `Nous avons bien reçu votre demande et vous enverrons un devis personnalisé très prochainement.`,
    yourReservation: 'Votre réservation',
    labelDate: 'Date',
    labelTime: 'Horaire',
    labelVenue: 'Lieu',
    labelRoom: 'Chambre',
    labelBooking: 'Réservation n°',
    labelTotal: 'TOTAL',
    labelOnRequest: 'Sur devis',
    ctaManage: 'GÉRER MA RÉSERVATION',
    cancellationNote: 'Annulation gratuite jusqu\'à 2 heures avant le rendez-vous.',
  },
  en: {
    statusConfirmed: 'BOOKING CONFIRMED',
    statusQuote: 'QUOTE REQUESTED',
    greetingConfirmed: `Your wellness experience has been successfully confirmed. We look forward to welcoming you.`,
    greetingQuote: `We've received your request and will send you a personalised quote very soon.`,
    yourReservation: 'Your reservation',
    labelDate: 'Date',
    labelTime: 'Time',
    labelVenue: 'Venue',
    labelRoom: 'Room',
    labelBooking: 'Booking #',
    labelTotal: 'TOTAL',
    labelOnRequest: 'On request',
    ctaManage: 'MANAGE MY BOOKING',
    cancellationNote: 'Free cancellation up to 2 hours before the appointment.',
  },
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
  language = 'fr',
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
  language?: 'fr' | 'en';
  venueType?: 'hotel' | 'coworking' | 'enterprise';
}) {
  const t = i18n[language] ?? i18n.en;
  const logoUrl = EMAIL_LOGO_URL;
  const brandName = brand.name;
  const manageBookingUrl = `${siteUrl}/booking/manage/${bookingId}`;
  const safeCurrency = (currency || 'EUR').toUpperCase();
  const hasOnQuoteItems = treatments.some(tr => tr.isPriceOnRequest);

  const statusLabel = isQuotePending ? t.statusQuote : t.statusConfirmed;
  const greeting = isQuotePending ? t.greetingQuote : t.greetingConfirmed;

  const treatmentsRows = treatments.map(tr => {
    const name = tr?.name || 'Service';
    const priceCell = tr.isPriceOnRequest
      ? `<td align="right" style="padding:6px 0;font-size:14px;font-family:Georgia,serif;color:#C5B197;font-style:italic;">${t.labelOnRequest}</td>`
      : `<td align="right" style="padding:6px 0;font-size:14px;font-family:Georgia,serif;">${tr.price ?? 0} ${safeCurrency}</td>`;
    return `<tr><td align="left" style="padding:6px 0;font-size:14px;font-family:Georgia,serif;">${name}</td>${priceCell}</tr>`;
  }).join('');

  const totalCell = hasOnQuoteItems
    ? `<td align="right" style="padding:12px 0 0;font-size:16px;font-family:Georgia,serif;color:#000351;"><strong>${totalPrice} ${safeCurrency}</strong> <span style="font-size:12px;color:#C5B197;">+ ${t.labelOnRequest.toLowerCase()}</span></td>`
    : `<td align="right" style="padding:12px 0 0;font-size:16px;font-family:Georgia,serif;color:#000351;"><strong>${totalPrice} ${safeCurrency}</strong></td>`;

  const roomRow = roomNumber
    ? `<tr><td style="padding:5px 0;font-size:12px;letter-spacing:1px;color:#999;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${t.labelRoom}</td><td style="padding:5px 0;font-size:14px;font-family:Georgia,serif;">${roomNumber}</td></tr>`
    : '';

  const salutation = language === 'fr' ? `Cher(e) ${clientName},` : `Dear ${clientName},`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;color:#000000;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <!-- Logo -->
        <img src="${logoUrl}" alt="${brandName}" width="140" style="display:block;margin-bottom:40px;">

        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

          <!-- Status label -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:#C5B197;font-family:Helvetica,Arial,sans-serif;">${statusLabel}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td align="center" style="padding-bottom:10px;">
              <h1 style="margin:0;font-weight:normal;font-size:26px;font-family:Georgia,'Times New Roman',serif;">${salutation}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:#555;font-family:Georgia,'Times New Roman',serif;max-width:420px;">${greeting}</p>
            </td>
          </tr>

          <!-- Booking details card -->
          <tr>
            <td style="background-color:#FEFBF7;border:1px solid #C5B197;padding:28px 32px;border-radius:4px;">

              <p style="margin:0 0 18px;font-size:10px;letter-spacing:2px;color:#C5B197;font-family:Helvetica,Arial,sans-serif;text-transform:uppercase;">${t.yourReservation}</p>

              <!-- Date + Time -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                <tr>
                  <td style="width:50%;padding-right:12px;">
                    <p style="margin:0 0 2px;font-size:10px;letter-spacing:1px;color:#999;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${t.labelDate}</p>
                    <p style="margin:0;font-size:16px;font-family:Georgia,'Times New Roman',serif;"><strong>${bookingDate}</strong></p>
                  </td>
                  <td style="width:50%;border-left:1px solid #C5B197;padding-left:20px;">
                    <p style="margin:0 0 2px;font-size:10px;letter-spacing:1px;color:#999;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${t.labelTime}</p>
                    <p style="margin:0;font-size:16px;font-family:Georgia,'Times New Roman',serif;"><strong>${bookingTime}</strong></p>
                  </td>
                </tr>
              </table>

              <!-- Venue + Room + Booking # -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                <tr>
                  <td style="padding:5px 0;font-size:12px;letter-spacing:1px;color:#999;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${t.labelVenue}</td>
                  <td style="padding:5px 0;font-size:14px;font-family:Georgia,serif;">${hotelName}</td>
                </tr>
                ${roomRow}
                <tr>
                  <td style="padding:5px 0;font-size:12px;letter-spacing:1px;color:#999;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${t.labelBooking}</td>
                  <td style="padding:5px 0;font-size:14px;font-family:Georgia,serif;">${String(bookingNumber).padStart(4, '0')}</td>
                </tr>
              </table>

              <!-- Treatments + Total -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top:1px solid #C5B197;padding-top:16px;">
                ${treatmentsRows}
                <tr>
                  <td align="left" style="padding:12px 0 0;font-size:16px;font-family:Georgia,serif;color:#000351;"><strong>${t.labelTotal}</strong></td>
                  ${totalCell}
                </tr>
              </table>

            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:36px 0 12px;">
              <a href="${manageBookingUrl}" style="background-color:#000351;color:#ffffff;padding:16px 36px;text-decoration:none;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;border-radius:2px;">${t.ctaManage}</a>
            </td>
          </tr>

          <!-- Cancellation note -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:12px;color:#999;font-family:Georgia,serif;font-style:italic;">${t.cancellationNote}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="border-top:1px solid #e5e5e5;padding-top:24px;">
              <p style="margin:0;font-size:10px;letter-spacing:3px;color:#bbb;font-family:Helvetica,Arial,sans-serif;">${brandName.toUpperCase()} &nbsp;·&nbsp; ${brand.tagline.toUpperCase()}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      language = 'fr',
      venueType = 'hotel'
    } = await req.json();

    const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';

    console.log('Sending booking confirmation email to:', email, '| isQuotePending:', isQuotePending, '| language:', lang);

    // Prefer the app URL coming from the checkout metadata/webhook, fallback to env
    const siteUrl =
      (typeof siteUrlFromBody === 'string' && siteUrlFromBody) ||
      Deno.env.get('SITE_URL') ||
      brand.website;

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
    const formattedDate = new Date(bookingDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
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
      language: lang,
      venueType,
    });

    const subjectPrefix = lang === 'fr'
      ? (isQuotePending ? 'Demande de devis' : 'Réservation confirmée')
      : (isQuotePending ? 'Quote Request' : 'Booking Confirmed');

    const clientResult = await sendEmail({
      to: email,
      subject: `${subjectPrefix} #${bookingNumber} - ${hotelName}`,
      html,
    });

    if (clientResult.error) {
      console.error('Error sending client email:', clientResult.error);
      throw new Error(clientResult.error);
    }
    console.log('Client email sent:', clientResult.id);

    const adminResult = await sendEmail({
      to: brand.emails.bookingRecipient,
      subject: `[ADMIN] ${subjectPrefix} #${bookingNumber} - ${hotelName}`,
      html,
    });
    if (adminResult.error) {
      console.error('Error sending admin email:', adminResult.error);
    } else {
      console.log('Admin email sent:', adminResult.id);
    }

    return new Response(
      JSON.stringify({ success: true, id: clientResult.id }),
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
