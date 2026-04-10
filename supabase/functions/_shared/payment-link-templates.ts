// Payment link email templates (French and English)

import { brand, EMAIL_LOGO_URL } from './brand.ts';
import {
  getBaseEmailTemplate,
  getEmailHeader,
  getTreatmentsList,
  getInfoRow
} from './email-template.ts';

export interface PaymentLinkTemplateData {
  clientName: string;
  hotelName: string;
  roomNumber?: string;
  bookingDate: string;
  bookingTime: string;
  bookingNumber: string | number;
  treatments: Array<{ name: string; price: number; duration?: number }>;
  totalPrice: number;
  paymentUrl: string;
  currency?: string;
  expiresAtText?: string; // Ajouté pour le redesign
  contactPhone?: string;  // Ajouté pour le redesign
  contactEmail?: string;  // Ajouté pour le redesign
}

export const getPaymentLinkEmailSubject = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  if (language === 'fr') {
    return `Lien de paiement - Réservation #${data.bookingNumber} - ${data.hotelName}`;
  }
  return `Payment Link - Booking #${data.bookingNumber} - ${data.hotelName}`;
};

/**
 * REDESIGN : Template Luxe pour les clients externes
 */
export const getExternalClientPaymentEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData, customWelcome?: string): string => {
  const isFr = language === 'fr';
  const currency = data.currency || '€';

  const labels = {
    title: isFr ? 'Confirmez votre expérience' : 'Confirm your experience',
    greeting: isFr ? `Chère ${data.clientName}` : `Dear ${data.clientName}`,
    welcome: isFr 
      ? `Nous avons hâte de vous accueillir chez ${data.hotelName}. Afin de garantir votre réservation, nous vous invitons à finaliser votre paiement.`
      : `We look forward to welcoming you at ${data.hotelName}. To guarantee your booking, please finalize your payment.`,
    detailsTitle: isFr ? 'VOTRE RÉSERVATION' : 'YOUR BOOKING',
    cta: isFr ? `CONFIRMER ET PAYER — ${data.totalPrice}${currency}` : `CONFIRM & PAY — ${data.totalPrice}${currency}`,
    validity: isFr ? `Ce lien est valide jusqu'au ${data.expiresAtText}` : `This link is valid until ${data.expiresAtText}`,
    cancelTitle: isFr ? 'POLITIQUE D\'ANNULATION' : 'CANCELLATION POLICY',
    cancelText: isFr 
      ? 'Merci de nous faire part de toute modification ou annulation au plus tard 24h avant votre soin. En cas d\'annulation tardive ou de non-présentation, le montant total sera dû.'
      : 'Please notify us of any modification or cancellation at least 24 hours before your treatment. In case of late cancellation or no-show, the total amount will be due.',
    contact: isFr ? 'Une question ? Contactez-nous :' : 'Any question? Contact us:',
  };

  const styles = {
    card: `background-color: #FEFBF7; border: 1px solid #C5B197; padding: 30px; border-radius: 4px;`,
    button: `background-color: #000351; color: #ffffff; padding: 16px 32px; text-decoration: none; display: inline-block; font-family: Georgia, serif; font-size: 14px; letter-spacing: 1px; border-radius: 2px;`,
    footerCard: `background-color: #FEFBF7; padding: 20px; font-size: 12px; color: #555; font-style: italic;`
  };

  return `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="UTF-8">
      <style>
        .serif { font-family: 'Georgia', 'Times New Roman', serif; }
        .sans { font-family: 'Helvetica', 'Arial', sans-serif; }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #ffffff; color: #000000; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <img src="${EMAIL_LOGO_URL}" alt="Lymfea" width="140" style="display: block; margin-bottom: 40px;">
            
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="width: 600px; max-width: 600px;">
              <tr>
                <td align="center" class="serif">
                  <h1 style="font-weight: normal; font-size: 24px; margin-bottom: 20px;">${labels.greeting},</h1>
                  <p style="font-size: 16px; line-height: 1.6; margin-bottom: 40px; padding: 0 40px;">${labels.welcome}</p>
                  
                  <div style="${styles.card}">
                    <p style="font-size: 11px; letter-spacing: 2px; color: #C5B197; margin-bottom: 20px;">${labels.detailsTitle}</p>
                    <p style="font-size: 18px; margin-bottom: 10px;"><strong>${data.bookingDate} à ${data.bookingTime}</strong></p>
                    <p style="font-size: 14px; margin-bottom: 25px; color: #666;">${data.hotelName}</p>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #C5B197; padding-top: 20px;">
                      ${data.treatments.map(t => `
                        <tr>
                          <td align="left" style="padding: 5px 0; font-size: 14px;">${t.name} ${t.duration ? `(${t.duration}min)` : ''}</td>
                          <td align="right" style="padding: 5px 0; font-size: 14px;">${t.price}${currency}</td>
                        </tr>
                      `).join('')}
                      <tr>
                        <td align="left" style="padding: 15px 0 0; font-size: 16px; color: #000351;"><strong>TOTAL</strong></td>
                        <td align="right" style="padding: 15px 0 0; font-size: 16px; color: #000351;"><strong>${data.totalPrice}${currency}</strong></td>
                      </tr>
                    </table>
                  </div>

                  <div style="padding: 40px 0;">
                    <a href="${data.paymentUrl}" style="${styles.button}">${labels.cta}</a>
                    <p style="font-size: 11px; color: #999; margin-top: 15px;">${labels.validity}</p>
                  </div>

                  <p style="font-size: 13px; color: #666; margin-bottom: 40px;">
                    ${labels.contact}<br/>
                    <a href="tel:${data.contactPhone}" style="color: #000; text-decoration: none;">${data.contactPhone}</a> | 
                    <a href="mailto:${data.contactEmail}" style="color: #000; text-decoration: none;">${data.contactEmail}</a>
                  </p>

                  <div style="${styles.footerCard}">
                    <p style="margin-bottom: 10px; font-weight: bold; font-style: normal; font-size: 10px; letter-spacing: 1px;">${labels.cancelTitle}</p>
                    ${labels.cancelText}
                  </div>
                  
                  <div style="padding: 40px 0; font-size: 10px; letter-spacing: 3px; color: #999;">
                    LYMFEA WELLNESS
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Template standard pour les clients hôtel (mention chambre)
 */
export const getPaymentLinkEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  const currency = data.currency || '€';

  if (language === 'fr') {
    return getBaseEmailTemplate(`
      ${getEmailHeader('', 'Lien de paiement', '#000000')}

      <tr>
        <td style="padding: 0 30px 30px;">
          <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
            Bonjour <strong>${data.clientName}</strong>,
          </p>

          <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
            Votre réservation bien-être est confirmée !
          </p>

          <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
            Un professionnel ${brand.name} se déplacera directement dans votre chambre pour vous offrir un moment de détente. <strong>Vous n'avez rien à faire</strong>, installez-vous confortablement et profitez.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
            <tr>
              <td style="padding: 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${getInfoRow('📍 Lieu', data.hotelName)}
                  ${getInfoRow('📅 Date', data.bookingDate)}
                  ${getInfoRow('🕐 Heure', data.bookingTime)}
                  ${getInfoRow('🚪 Chambre', data.roomNumber || '-')}
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

    <tr>
      <td style="padding: 0 30px 30px;">
        <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
          Hello <strong>${data.clientName}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          Your wellness booking is confirmed!
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          A ${brand.name} professional will come directly to your hotel room to provide you with a relaxing experience. <strong>You don't have to do anything</strong>, just sit back and enjoy.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${getInfoRow('📍 Location', data.hotelName)}
                ${getInfoRow('📅 Date', data.bookingDate)}
                ${getInfoRow('🕐 Time', data.bookingTime)}
                ${getInfoRow('🚪 Room', data.roomNumber || '-')}
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
export const getPaymentCancellationEmailHtml = (language: 'fr' | 'en', data: { clientName: string, bookingDate: string }) => {
  const isFr = language === 'fr';
  const labels = {
    title: isFr ? 'Réservation Annulée' : 'Booking Cancelled',
    message: isFr 
      ? `Bonjour ${data.clientName}, nous n'avons pas reçu votre paiement dans le délai imparti pour votre séance du ${data.bookingDate}. Par sécurité, votre réservation a été automatiquement annulée.`
      : `Hello ${data.clientName}, we did not receive your payment within the required time for your session on ${data.bookingDate}. For security reasons, your booking has been automatically cancelled.`,
    cta: isFr ? 'Réserver à nouveau' : 'Book again'
  };

  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; text-align: center; padding: 40px; border: 1px solid #eee;">
      <h1 style="color: #000; font-weight: normal;">${labels.title}</h1>
      <p style="color: #666; line-height: 1.6; margin: 20px 0;">${labels.message}</p>
      <a href="${brand.website}" style="display: inline-block; padding: 15px 30px; background-color: #000351; color: #fff; text-decoration: none; margin-top: 20px;">${labels.cta}</a>
    </div>
  `;
};
export const getPaymentReminderEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData,) => {
  const isFr = language === 'fr';
  
  // On remplace le message d'accueil par un message de rappel urgent
  const reminderWelcome = isFr 
    ? `Votre réservation pour votre séance de bien-être n'est pas encore confirmée. Pour garantir la disponibilité de votre créneau, merci de finaliser votre paiement avant le ${data.expiresAtText}.`
    : `Your wellness booking is not yet confirmed. To guarantee your slot availability, please finalize your payment before ${data.expiresAtText}.`;

  // On utilise le même moteur de rendu que l'email initial pour garder le design
  return getExternalClientPaymentEmailHtml(language, {
    ...data,
    clientName: data.clientName, // On peut passer une chaîne personnalisée ici si besoin
  }, reminderWelcome); 
};
// WhatsApp message templates
export const getPaymentLinkWhatsAppMessage = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  const currency = data.currency || '€';
  const treatmentsList = data.treatments.map(t => `• ${t.name} - ${t.price}${currency}`).join('\n');
  const hasRoom = data.roomNumber && data.roomNumber !== '';

  if (language === 'fr') {
    const roomInfo = hasRoom ? ` directement dans votre chambre ${data.roomNumber}` : '';
    return `💫 ${brand.name} - Lien de paiement

Bonjour ${data.clientName} !

Votre réservation bien-être est confirmée ✨

Un professionnel viendra${roomInfo} chez ${data.hotelName}. Vous n'avez rien à faire, juste profiter !

📅 ${data.bookingDate} à ${data.bookingTime}
🎯 Réservation #${data.bookingNumber}

💆 Prestations:
${treatmentsList}

💰 Total: ${data.totalPrice}${currency}

👉 Payez ici: ${data.paymentUrl}

Ce lien est valide pour une durée limitée.

L'équipe ${brand.name}`;
  }

  // English version
  const roomInfo = hasRoom ? ` directly to your room ${data.roomNumber}` : '';
  return `💫 ${brand.name} - Payment Link

Hello ${data.clientName}!

Your wellness booking is confirmed ✨

A professional will come${roomInfo} at ${data.hotelName}. You don't have to do anything, just relax and enjoy!

📅 ${data.bookingDate} at ${data.bookingTime}
🎯 Booking #${data.bookingNumber}

💆 Services:
${treatmentsList}

💰 Total: ${data.totalPrice}${currency}

👉 Pay here: ${data.paymentUrl}

This link is valid for a limited time.

The ${brand.name} Team`;
};