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
  hotelImageUrl?: string;
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
  urgency?: 'normal' | 'urgent' | 'very_urgent' | 'immediate';
  
}

export const getPaymentLinkEmailSubject = (language: 'fr' | 'en', data: PaymentLinkTemplateData): string => {
  const formattedNumber = String(data.bookingNumber).padStart(4, '0');
  const urgency = data.urgency || 'normal';

  if (language === 'fr') {
    if (urgency === 'immediate') return `Confirmation requise avant expiration · ${data.hotelName}`;
    if (urgency === 'very_urgent') return `Votre soin de ce jour — Confirmation requise · ${data.hotelName}`;
    if (urgency === 'urgent') return `Action requise — Réservation #${formattedNumber} · ${data.hotelName}`;
    return `Lien de paiement — Réservation #${formattedNumber} · ${data.hotelName}`;
  }
  if (urgency === 'immediate') return `Confirmation required before expiry · ${data.hotelName}`;
  if (urgency === 'very_urgent') return `Your treatment today — Confirmation required · ${data.hotelName}`;
  if (urgency === 'urgent') return `Action required — Booking #${formattedNumber} · ${data.hotelName}`;
  return `Payment Link — Booking #${formattedNumber} · ${data.hotelName}`;
};

/**
 * REDESIGN : Template Luxe pour les clients externes
 */
export const getExternalClientPaymentEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData, customWelcome?: string): string => {
  const isFr = language === 'fr';
  const currency = data.currency || '€';
  const urgency = data.urgency || 'normal';

  // Copy du welcome selon l'urgence — ton hôtel de luxe dans tous les cas
  const defaultWelcome = (() => {
    if (isFr) {
      if (urgency === 'immediate') return `Votre soin débute très prochainement. Pour le confirmer, nous vous invitons à procéder au règlement avant le <strong>${data.expiresAtText}</strong>.`;
      if (urgency === 'very_urgent') return `Votre rendez-vous est prévu dans quelques heures. Afin de le maintenir, merci de finaliser votre règlement avant le <strong>${data.expiresAtText}</strong>.`;
      if (urgency === 'urgent') return `Afin de garantir votre créneau chez ${data.hotelName}, nous vous invitons à finaliser votre règlement avant le <strong>${data.expiresAtText}</strong>.`;
      return `Nous avons hâte de vous accueillir chez ${data.hotelName}. Afin de confirmer votre réservation, nous vous invitons à finaliser votre paiement.`;
    } else {
      if (urgency === 'immediate') return `Your treatment is about to begin. To confirm it, please complete your payment before <strong>${data.expiresAtText}</strong>.`;
      if (urgency === 'very_urgent') return `Your appointment is in a few hours. To secure it, please finalize your payment before <strong>${data.expiresAtText}</strong>.`;
      if (urgency === 'urgent') return `To secure your slot at ${data.hotelName}, please finalize your payment before <strong>${data.expiresAtText}</strong>.`;
      return `We look forward to welcoming you at ${data.hotelName}. To confirm your booking, please finalize your payment.`;
    }
  })();

  // Badge discret au-dessus du CTA selon l'urgence
  const urgencyBadge = (() => {
    if (urgency === 'normal') return '';
    const badgeStyles: Record<string, string> = {
      urgent:     'background-color:#FFF8EE; border:1px solid #C5B197; color:#8B6914;',
      very_urgent:'background-color:#FFF3F3; border:1px solid #C5A0A0; color:#7A1F1F;',
      immediate:  'background-color:#FFF0F0; border:1px solid #B07070; color:#6B1010;',
    };
    const badgeText: Record<string, string> = {
      urgent:      isFr ? 'CONFIRMATION REQUISE' : 'CONFIRMATION REQUIRED',
      very_urgent: isFr ? 'RÉPONSE URGENTE REQUISE' : 'URGENT RESPONSE REQUIRED',
      immediate:   isFr ? 'PAIEMENT IMMÉDIAT REQUIS' : 'IMMEDIATE PAYMENT REQUIRED',
    };
    return `<p style="font-size:10px;letter-spacing:2px;padding:8px 16px;border-radius:2px;display:inline-block;margin-bottom:16px;${badgeStyles[urgency]}">${badgeText[urgency]}</p>`;
  })();

  // Texte sous le bouton de paiement
  const validityText = (() => {
    if (urgency === 'immediate') {
      return isFr
        ? `Ce lien expire dans moins d'une heure. Passé ce délai, votre réservation sera automatiquement annulée.`
        : `This link expires in less than one hour. After this delay, your booking will be automatically cancelled.`;
    }
    if (urgency === 'very_urgent') {
      return isFr
        ? `Ce lien est valide jusqu'au <strong>${data.expiresAtText}</strong>. Au-delà, votre créneau sera libéré.`
        : `This link is valid until <strong>${data.expiresAtText}</strong>. After that, your slot will be released.`;
    }
    if (urgency === 'urgent') {
      return isFr
        ? `Ce lien sécurisé est disponible jusqu'au <strong>${data.expiresAtText}</strong>.`
        : `This secure link is available until <strong>${data.expiresAtText}</strong>.`;
    }
    return isFr
      ? `Pour confirmer votre réservation, ce lien sécurisé est disponible jusqu'au <strong>${data.expiresAtText}</strong>.`
      : `To confirm your booking, this secure link is available until <strong>${data.expiresAtText}</strong>.`;
  })();

  const validityColor = urgency === 'immediate' ? '#7A1F1F' : urgency === 'very_urgent' ? '#7A3F1F' : '#555';

  const labels = {
    title: isFr ? 'Confirmez votre expérience' : 'Confirm your experience',
    greeting: isFr ? `Chère ${data.clientName}` : `Dear ${data.clientName}`,
    welcome: customWelcome ?? defaultWelcome,
    detailsTitle: isFr ? 'VOTRE RÉSERVATION' : 'YOUR BOOKING',
    cta: isFr ? `CONFIRMER ET PAYER — ${data.totalPrice}${currency}` : `CONFIRM & PAY — ${data.totalPrice}${currency}`,
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
            ${data.hotelImageUrl ? `
            <img src="${data.hotelImageUrl}" alt="${data.hotelName}" style="display: block; width: 100%; max-width: 600px; height: auto; margin-bottom: 40px; border-radius: 4px;">
            ` : ''}
            
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="width: 600px; max-width: 600px;">
              <tr>
                <td align="center" class="serif">
                  <h1 style="font-weight: normal; font-size: 24px; margin-bottom: 20px;">${labels.greeting},</h1>
                  <p style="font-size: 16px; line-height: 1.6; margin-bottom: 40px; padding: 0 40px;">${labels.welcome}</p>
                  
                  <div style="${styles.card}">
                    <p style="font-size: 11px; letter-spacing: 2px; color: #C5B197; margin-bottom: 20px;">${labels.detailsTitle}</p>
                    <p style="font-size: 18px; margin-bottom: 10px;"><strong>${data.bookingDate} ${isFr ? 'à' : 'at'} ${data.bookingTime}</strong></p>
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

                  <div style="padding: 40px 0; text-align: center;">
                    ${urgencyBadge}
                    ${urgencyBadge ? '<br/>' : ''}
                    <a href="${data.paymentUrl}" style="${styles.button}">${labels.cta}</a>
                    <p style="font-size: 13px; margin-top: 16px; line-height: 1.6; color: ${validityColor}; font-family: Georgia, serif; font-style: italic;">${validityText}</p>
                  </div>

                  <p style="font-size: 13px; color: #666; margin-bottom: 40px;">
                    ${labels.contact}<br/>
                    ${data.contactPhone ? `<a href="tel:${data.contactPhone}" style="color: #000; text-decoration: none;">${data.contactPhone}</a> | ` : ''}
                    <a href="mailto:${data.contactEmail || 'hello@lymfea.com'}" style="color: #000; text-decoration: none;">${data.contactEmail || 'hello@lymfea.com'}</a>
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
  const isFr = language === 'fr';
  const urgency = data.urgency || 'normal';

  const introText = (() => {
    if (isFr) {
      if (urgency === 'immediate') return `Votre soin débute très prochainement. Pour le confirmer, merci de procéder au règlement <strong>avant le ${data.expiresAtText}</strong>.`;
      if (urgency === 'very_urgent') return `Votre rendez-vous est dans quelques heures. Afin de le maintenir, nous vous invitons à finaliser votre règlement <strong>avant le ${data.expiresAtText}</strong>.`;
      if (urgency === 'urgent') return `Afin de garantir votre créneau, nous vous invitons à finaliser votre règlement <strong>avant le ${data.expiresAtText}</strong>.`;
      return `Un professionnel ${brand.name} se déplacera directement dans votre chambre pour vous offrir un moment de détente. <strong>Vous n'avez rien à faire</strong>, installez-vous confortablement et profitez.`;
    } else {
      if (urgency === 'immediate') return `Your treatment is about to begin. To confirm it, please complete your payment <strong>before ${data.expiresAtText}</strong>.`;
      if (urgency === 'very_urgent') return `Your appointment is in a few hours. To secure it, please finalize your payment <strong>before ${data.expiresAtText}</strong>.`;
      if (urgency === 'urgent') return `To secure your slot, please finalize your payment <strong>before ${data.expiresAtText}</strong>.`;
      return `A ${brand.name} professional will come directly to your hotel room to provide you with a relaxing experience. <strong>You don't have to do anything</strong>, just sit back and enjoy.`;
    }
  })();

  const validityNote = (() => {
    if (urgency === 'immediate') {
      return isFr
        ? `Ce lien expire dans moins d'une heure. Au-delà, votre réservation sera automatiquement annulée.`
        : `This link expires in less than one hour. After this delay, your booking will be automatically cancelled.`;
    }
    if (urgency === 'very_urgent' || urgency === 'urgent') {
      return isFr
        ? `Ce lien est valide jusqu'au ${data.expiresAtText}.`
        : `This link is valid until ${data.expiresAtText}.`;
    }
    return isFr
      ? `Action requise : Ce lien est valide jusqu'au ${data.expiresAtText}.`
      : `Action required: This link is valid until ${data.expiresAtText}.`;
  })();

  const noteColor = urgency === 'immediate' || urgency === 'very_urgent' ? '#7A1F1F' : '#b91c1c';
  const buttonText = isFr ? 'Payer maintenant' : 'Pay Now';
  const headerTitle = isFr ? 'Lien de paiement' : 'Payment Link';

  return getBaseEmailTemplate(`
    ${getEmailHeader('', headerTitle, '#000000')}

    <tr>
      <td style="padding: 0 30px 30px;">
        <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
          ${isFr ? 'Bonjour' : 'Hello'} <strong>${data.clientName}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          ${isFr ? 'Votre réservation bien-être est confirmée.' : 'Your wellness booking is confirmed.'}
        </p>

        <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0;">
          ${introText}
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #000;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${getInfoRow(isFr ? '📍 Lieu' : '📍 Location', data.hotelName)}
                ${getInfoRow(isFr ? '📅 Date' : '📅 Date', data.bookingDate)}
                ${getInfoRow(isFr ? '🕐 Heure' : '🕐 Time', data.bookingTime)}
                ${getInfoRow(isFr ? '🚪 Chambre' : '🚪 Room', data.roomNumber || '-')}
              </table>
            </td>
          </tr>
        </table>

        ${getTreatmentsList(data.treatments, data.totalPrice, currency)}

        <p style="font-size: 13px; margin: 24px 0 0 0; text-align: center; font-weight: bold; color: ${noteColor}; font-style: italic;">
          ${validityNote}
        </p>
      </td>
    </tr>
  `, {
    showButton: true,
    buttonText,
    buttonUrl: data.paymentUrl,
  });
};
export const getPaymentCancellationEmailHtml = (language: 'fr' | 'en', data: { clientName: string, bookingDate: string, bookingUrl?: string }) => {
  const isFr = language === 'fr';
  const ctaUrl = data.bookingUrl || brand.website;

  return `<!DOCTYPE html>
<html lang="${language}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;color:#000000;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <img src="${EMAIL_LOGO_URL}" alt="${brand.name}" width="140" style="display:block;margin-bottom:40px;">

        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:#C5B197;font-family:Helvetica,Arial,sans-serif;">${isFr ? 'RÉSERVATION ANNULÉE' : 'BOOKING CANCELLED'}</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:10px;">
              <h1 style="margin:0;font-weight:normal;font-size:26px;font-family:Georgia,'Times New Roman',serif;">${isFr ? `Chère ${data.clientName}` : `Dear ${data.clientName}`},</h1>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:#555;font-family:Georgia,'Times New Roman',serif;max-width:420px;">
                ${isFr
                  ? `Nous n'avons pas reçu votre paiement dans le délai imparti pour votre séance du <strong>${data.bookingDate}</strong>. Afin de ne pas bloquer ce créneau, votre réservation a été automatiquement annulée.`
                  : `We did not receive your payment within the required time for your session on <strong>${data.bookingDate}</strong>. To avoid blocking this slot indefinitely, your booking has been automatically cancelled.`}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FEFBF7;border:1px solid #C5B197;padding:24px 32px;border-radius:4px;text-align:center;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;color:#C5B197;font-family:Helvetica,Arial,sans-serif;text-transform:uppercase;">${isFr ? 'Votre créneau est disponible' : 'Your slot is available again'}</p>
              <p style="margin:0;font-size:14px;font-family:Georgia,serif;color:#555;">
                ${isFr ? 'Vous pouvez réserver à nouveau en un clic.' : 'You can book again in one click.'}
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:36px 0 12px;">
              <a href="${ctaUrl}" style="background-color:#000351;color:#ffffff;padding:16px 36px;text-decoration:none;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;border-radius:2px;">${isFr ? 'RÉSERVER À NOUVEAU' : 'BOOK AGAIN'}</a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:12px;color:#999;font-family:Georgia,serif;font-style:italic;">
                ${isFr ? 'Une question ? Contactez-nous à ' : 'Any question? Contact us at '}
                <a href="mailto:${brand.legal.contactEmail}" style="color:#999;">${brand.legal.contactEmail}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="border-top:1px solid #e5e5e5;padding-top:24px;">
              <p style="margin:0;font-size:10px;letter-spacing:3px;color:#bbb;font-family:Helvetica,Arial,sans-serif;">${brand.name.toUpperCase()} &nbsp;·&nbsp; ${brand.tagline.toUpperCase()}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
export const getPaymentReminderEmailHtml = (language: 'fr' | 'en', data: PaymentLinkTemplateData) => {
  const isFr = language === 'fr';
  
  // NOUVEAU TEXTE EXACT DU TICKET :
  const reminderWelcome = isFr 
    ? `Votre réservation n'est pas encore confirmée. Confirmez avant le ${data.expiresAtText} pour garantir votre créneau.<br/><br/><strong>Passé ce délai, votre réservation sera automatiquement annulée.</strong>`
    : `Your booking is not yet confirmed. Please confirm before ${data.expiresAtText} to secure your slot.<br/><br/><strong>After this deadline, your booking will be automatically cancelled.</strong>`;

  return getExternalClientPaymentEmailHtml(language, {
    ...data,
    urgency: 'urgent' // Pour forcer la couleur rouge
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