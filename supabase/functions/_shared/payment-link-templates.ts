// Payment link email templates (French and English)

import {
  getBaseEmailTemplate,
  getEmailHeader,
  getTreatmentsList,
  getInfoRow
} from './email-template.ts';

export interface PaymentLinkTemplateData {
  clientName: string;
  hotelName: string;
  roomNumber: string;
  bookingDate: string;
  bookingTime: string;
  bookingNumber: string | number;
  treatments: Array<{ name: string; price: number; duration?: number }>;
  totalPrice: number;
  paymentUrl: string;
  currency?: string;
}

export const getPaymentLinkEmailSubject = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  if (language === 'fr') {
    return `Lien de paiement - Réservation #${data.bookingNumber} - ${data.hotelName}`;
  }
  return `Payment Link - Booking #${data.bookingNumber} - ${data.hotelName}`;
};

export const getPaymentLinkEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  const currency = data.currency || '€';

  if (language === 'fr') {
    return getBaseEmailTemplate(`
      ${getEmailHeader('', 'Lien de paiement', '#000000')}

      <!-- Content -->
      <tr>
        <td style="padding: 0 30px 30px;">
          <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
            Bonjour <strong>${data.clientName}</strong>,
          </p>

          <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
            Votre réservation bien-être est confirmée !
          </p>

          <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
            Un professionnel OOM World se déplacera directement dans votre chambre pour vous offrir un moment de détente. <strong>Vous n'avez rien à faire</strong>, installez-vous confortablement et profitez.
          </p>

          <!-- Booking Details Card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
            <tr>
              <td style="padding: 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${getInfoRow('📍 Lieu', data.hotelName)}
                  ${getInfoRow('📅 Date', data.bookingDate)}
                  ${getInfoRow('🕐 Heure', data.bookingTime)}
                  ${getInfoRow('🚪 Chambre', data.roomNumber)}
                </table>
              </td>
            </tr>
          </table>

          ${getTreatmentsList(data.treatments, data.totalPrice, currency)}

          <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; text-align: center;">
            Ce lien est valide pendant 24 heures.
          </p>
        </td>
      </tr>
    `, {
      showButton: true,
      buttonText: 'Payer maintenant',
      buttonUrl: data.paymentUrl
    });
  }

  // English version
  return getBaseEmailTemplate(`
    ${getEmailHeader('', 'Payment Link', '#000000')}

    <!-- Content -->
    <tr>
      <td style="padding: 0 30px 30px;">
        <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
          Hello <strong>${data.clientName}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          Your wellness booking is confirmed!
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          An OOM World professional will come directly to your hotel room to provide you with a relaxing experience. <strong>You don't have to do anything</strong>, just sit back and enjoy.
        </p>

        <!-- Booking Details Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${getInfoRow('📍 Location', data.hotelName)}
                ${getInfoRow('📅 Date', data.bookingDate)}
                ${getInfoRow('🕐 Time', data.bookingTime)}
                ${getInfoRow('🚪 Room', data.roomNumber)}
              </table>
            </td>
          </tr>
        </table>

        ${getTreatmentsList(data.treatments, data.totalPrice, currency)}

        <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; text-align: center;">
          This link is valid for 24 hours.
        </p>
      </td>
    </tr>
  `, {
    showButton: true,
    buttonText: 'Pay Now',
    buttonUrl: data.paymentUrl
  });
};

// WhatsApp message templates
export const getPaymentLinkWhatsAppMessage = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  const currency = data.currency || '€';
  const treatmentsList = data.treatments.map(t => `• ${t.name} - ${t.price}${currency}`).join('\n');

  if (language === 'fr') {
    return `💫 OOM World - Lien de paiement

Bonjour ${data.clientName} !

Votre réservation bien-être est confirmée ✨

Un professionnel viendra directement dans votre chambre ${data.roomNumber} à ${data.hotelName}. Vous n'avez rien à faire, juste profiter !

📅 ${data.bookingDate} à ${data.bookingTime}
🎯 Réservation #${data.bookingNumber}

💆 Prestations:
${treatmentsList}

💰 Total: ${data.totalPrice}${currency}

👉 Payez ici: ${data.paymentUrl}

Ce lien expire dans 24h.

L'équipe OOM World`;
  }

  // English version
  return `💫 OOM World - Payment Link

Hello ${data.clientName}!

Your wellness booking is confirmed ✨

A professional will come directly to your room ${data.roomNumber} at ${data.hotelName}. You don't have to do anything, just relax and enjoy!

📅 ${data.bookingDate} at ${data.bookingTime}
🎯 Booking #${data.bookingNumber}

💆 Services:
${treatmentsList}

💰 Total: ${data.totalPrice}${currency}

👉 Pay here: ${data.paymentUrl}

This link expires in 24h.

The OOM World Team`;
};
