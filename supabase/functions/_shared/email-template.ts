// Shared email template styles and components for OOM World emails

export const emailStyles = {
  // Colors
  primaryColor: '#000000',
  successColor: '#22c55e',
  warningColor: '#f59e0b',
  mutedColor: '#6b7280',
  lightGray: '#f9fafb',
  borderColor: '#e5e7eb',
  
  // Fonts
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export const getBaseEmailTemplate = (content: string, options?: {
  showButton?: boolean;
  buttonText?: string;
  buttonUrl?: string;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          ${content}
          
          ${options?.showButton ? `
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${options.buttonUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${options.buttonText}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding: 30px; background-color: #fafafa; border-top: 1px solid #f0f0f0;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">OOM World</p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">Beauty & Wellness Services</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const getEmailHeader = (title: string, badgeText?: string, badgeColor: string = '#22c55e') => `
<!-- Header -->
<tr>
  <td style="text-align: center; padding: 40px 30px 20px;">
    <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #000;">OOM</h1>
    ${badgeText ? `
    <div style="margin-top: 16px;">
      <span style="display: inline-block; background-color: ${badgeColor}; color: white; padding: 10px 24px; border-radius: 24px; font-size: 14px; font-weight: 600;">${badgeText}</span>
    </div>
    ` : ''}
    ${title ? `<h2 style="margin: 20px 0 0 0; font-size: 20px; font-weight: 600; color: #333;">${title}</h2>` : ''}
  </td>
</tr>
`;

export const getInfoRow = (label: string, value: string) => `
<tr>
  <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
    <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">${label}</span>
    <span style="font-size: 16px; font-weight: 500; color: #111;">${value}</span>
  </td>
</tr>
`;

export const getDateTimeHighlight = (date: string, time: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; font-weight: 600;">Date & Heure</p>
      <p style="margin: 0; font-size: 20px; font-weight: 600; color: #000;">${date}</p>
      <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 600; color: #000;">à ${time}</p>
    </td>
  </tr>
</table>
`;

export const getTreatmentsList = (treatments: Array<{name: string, price: number, duration?: number}>, totalPrice: number, currency: string = '€') => {
  if (!treatments || treatments.length === 0) return '';
  
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #374151;">Prestations</p>
      ${treatments.map(t => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
              <span style="font-size: 15px; color: #374151;">${t.name}${t.duration ? ` (${t.duration}min)` : ''}</span>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
              <span style="font-size: 15px; font-weight: 600; color: #374151;">${t.price}${currency}</span>
            </td>
          </tr>
        </table>
      `).join('')}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 2px solid #e5e7eb; padding-top: 16px;">
        <tr>
          <td style="font-size: 18px; font-weight: 600; color: #111;">Total</td>
          <td style="text-align: right; font-size: 24px; font-weight: bold; color: #000;">${totalPrice}${currency}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
};

export const getBookingCard = (booking: {
  bookingId: number | string;
  clientName: string;
  phone?: string;
  hotelName: string;
  roomNumber?: string;
  hairdresserName?: string;
}) => `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
  ${getInfoRow('Numéro de réservation', `#${booking.bookingId}`)}
  ${getInfoRow('Client', booking.clientName)}
  ${booking.phone ? getInfoRow('Téléphone', booking.phone) : ''}
  ${getInfoRow('Hôtel', booking.hotelName)}
  ${booking.roomNumber ? getInfoRow('Chambre', booking.roomNumber) : ''}
  ${booking.hairdresserName ? getInfoRow('Coiffeur', booking.hairdresserName) : ''}
</table>
`;
