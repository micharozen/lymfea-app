// Meta WhatsApp Business API utilities
// https://developers.facebook.com/docs/whatsapp/cloud-api/

export interface WhatsAppTemplateMessage {
  templateName: string;
  languageCode: string;
  components: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{
      type: 'text' | 'image' | 'document';
      text?: string;
    }>;
    sub_type?: 'quick_reply';
    index?: number;
  }>;
}

export interface WhatsAppInteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

export interface WhatsAppInteractiveMessage {
  type: 'button';
  body: {
    text: string;
  };
  action: {
    buttons: WhatsAppInteractiveButton[];
  };
}

// Send a template message via Meta WhatsApp Business API
export async function sendWhatsAppTemplate(
  to: string,
  template: WhatsAppTemplateMessage
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'WhatsApp credentials not configured' };
  }

  // Format phone number (remove + and spaces)
  const formattedPhone = to.replace(/[\s+]/g, '');

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    type: 'template',
    template: {
      name: template.templateName,
      language: {
        code: template.languageCode,
      },
      components: template.components,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', result);
      return {
        success: false,
        error: result.error?.message || 'Failed to send WhatsApp message',
      };
    }

    return {
      success: true,
      messageId: result.messages?.[0]?.id,
    };
  } catch (error) {
    console.error('WhatsApp API exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send an interactive button message via Meta WhatsApp Business API
export async function sendWhatsAppInteractive(
  to: string,
  message: WhatsAppInteractiveMessage
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'WhatsApp credentials not configured' };
  }

  // Format phone number (remove + and spaces)
  const formattedPhone = to.replace(/[\s+]/g, '');

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    type: 'interactive',
    interactive: message,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', result);
      return {
        success: false,
        error: result.error?.message || 'Failed to send WhatsApp message',
      };
    }

    return {
      success: true,
      messageId: result.messages?.[0]?.id,
    };
  } catch (error) {
    console.error('WhatsApp API exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Template names - these must match the templates created in Meta Business Suite
export const WHATSAPP_TEMPLATES = {
  ALTERNATIVE_SLOT_OFFER: 'alternative_slot_offer',
  ALTERNATIVE_SLOT_OFFER_2: 'alternative_slot_offer_2',
  ALTERNATIVE_ALL_REJECTED: 'alternative_all_rejected',
  ALTERNATIVE_ACCEPTED: 'alternative_accepted',
  PAYMENT_LINK_FR: 'payment_link_fr',
  PAYMENT_LINK_EN: 'payment_link_en',
} as const;

// Button IDs/payloads for webhook response matching
// These should match the payloads defined in your Meta WhatsApp templates
// If no payload is defined, Meta uses the button text
export const BUTTON_IDS = {
  ACCEPT_SLOT: 'accept_slot',
  REJECT_SLOT: 'reject_slot',
} as const;

// Alternative: match by button text (French)
export const BUTTON_TEXTS = {
  ACCEPT: ["oui, j'accepte", "oui j'accepte", "oui"],
  REJECT: ["non, autre proposition", "non autre proposition", "non merci", "non"],
} as const;

// Helper to check if a response is an acceptance
export function isAcceptResponse(buttonId: string): boolean {
  const normalized = buttonId.toLowerCase().trim();
  return (
    normalized === BUTTON_IDS.ACCEPT_SLOT ||
    BUTTON_TEXTS.ACCEPT.some(text => normalized.includes(text))
  );
}

// Helper to check if a response is a rejection
export function isRejectResponse(buttonId: string): boolean {
  const normalized = buttonId.toLowerCase().trim();
  return (
    normalized === BUTTON_IDS.REJECT_SLOT ||
    BUTTON_TEXTS.REJECT.some(text => normalized.includes(text))
  );
}

// Format date for WhatsApp messages (French format)
export function formatDateForWhatsApp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Format time for WhatsApp messages
export function formatTimeForWhatsApp(timeStr: string): string {
  // timeStr is in format "HH:MM:SS" or "HH:MM"
  const [hours, minutes] = timeStr.split(':');
  return `${hours}h${minutes}`;
}

// Build the first alternative slot offer message
export function buildAlternativeSlotOffer1Message(
  clientName: string,
  originalDate: string,
  originalTime: string,
  alternativeDate: string,
  alternativeTime: string
): WhatsAppInteractiveMessage {
  const formattedOriginalDate = formatDateForWhatsApp(originalDate);
  const formattedOriginalTime = formatTimeForWhatsApp(originalTime);
  const formattedAltDate = formatDateForWhatsApp(alternativeDate);
  const formattedAltTime = formatTimeForWhatsApp(alternativeTime);

  return {
    type: 'button',
    body: {
      text: `Bonjour ${clientName} !\n\nVotre coiffeur n'est pas disponible le ${formattedOriginalDate} à ${formattedOriginalTime}.\n\nIl vous propose le ${formattedAltDate} à ${formattedAltTime}.\n\nCe créneau vous convient ?`,
    },
    action: {
      buttons: [
        {
          type: 'reply',
          reply: {
            id: BUTTON_IDS.ACCEPT_SLOT,
            title: "Oui, j'accepte",
          },
        },
        {
          type: 'reply',
          reply: {
            id: BUTTON_IDS.REJECT_SLOT,
            title: 'Autre proposition',
          },
        },
      ],
    },
  };
}

// Build the second alternative slot offer message
export function buildAlternativeSlotOffer2Message(
  alternativeDate: string,
  alternativeTime: string
): WhatsAppInteractiveMessage {
  const formattedDate = formatDateForWhatsApp(alternativeDate);
  const formattedTime = formatTimeForWhatsApp(alternativeTime);

  return {
    type: 'button',
    body: {
      text: `Pas de souci ! Que pensez-vous du ${formattedDate} à ${formattedTime} ?`,
    },
    action: {
      buttons: [
        {
          type: 'reply',
          reply: {
            id: BUTTON_IDS.ACCEPT_SLOT,
            title: "Oui, j'accepte",
          },
        },
        {
          type: 'reply',
          reply: {
            id: BUTTON_IDS.REJECT_SLOT,
            title: 'Non merci',
          },
        },
      ],
    },
  };
}

// Build the "all rejected" message
export function buildAllRejectedMessage(): WhatsAppInteractiveMessage {
  return {
    type: 'button',
    body: {
      text: `Nous avons informé votre coiffeur. Il vous recontactera prochainement pour trouver un créneau qui vous convient.\n\nL'équipe OOM World`,
    },
    action: {
      buttons: [
        {
          type: 'reply',
          reply: {
            id: 'ok',
            title: 'OK',
          },
        },
      ],
    },
  };
}

// Build the "slot accepted" confirmation message
export function buildSlotAcceptedMessage(
  acceptedDate: string,
  acceptedTime: string
): WhatsAppInteractiveMessage {
  const formattedDate = formatDateForWhatsApp(acceptedDate);
  const formattedTime = formatTimeForWhatsApp(acceptedTime);

  return {
    type: 'button',
    body: {
      text: `Parfait ! Votre réservation est confirmée pour le ${formattedDate} à ${formattedTime}.\n\nÀ très bientôt !\nL'équipe OOM World`,
    },
    action: {
      buttons: [
        {
          type: 'reply',
          reply: {
            id: 'ok',
            title: 'OK',
          },
        },
      ],
    },
  };
}

// Build the payment link template message
export function buildPaymentLinkTemplateMessage(
  language: 'fr' | 'en',
  clientName: string,
  roomNumber: string,
  hotelName: string,
  bookingDate: string,
  bookingTime: string,
  bookingNumber: string | number,
  treatments: string,
  totalPrice: string,
  paymentUrl: string
): WhatsAppTemplateMessage {
  return {
    templateName: language === 'fr' ? WHATSAPP_TEMPLATES.PAYMENT_LINK_FR : WHATSAPP_TEMPLATES.PAYMENT_LINK_EN,
    languageCode: language === 'fr' ? 'fr' : 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: clientName },           // {{1}}
          { type: 'text', text: roomNumber },           // {{2}}
          { type: 'text', text: hotelName },            // {{3}}
          { type: 'text', text: bookingDate },          // {{4}}
          { type: 'text', text: bookingTime },          // {{5}}
          { type: 'text', text: String(bookingNumber) }, // {{6}}
          { type: 'text', text: treatments },           // {{7}}
          { type: 'text', text: totalPrice },           // {{8}}
          { type: 'text', text: paymentUrl },           // {{9}}
        ],
      },
    ],
  };
}
