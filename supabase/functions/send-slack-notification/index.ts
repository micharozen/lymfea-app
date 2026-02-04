import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackNotificationPayload {
  type: 'new_booking' | 'booking_confirmed' | 'booking_cancelled';
  bookingId: string;
  bookingNumber: string;
  clientName: string;
  hotelName: string;
  bookingDate: string;
  bookingTime: string;
  hairdresserName?: string;
  totalPrice?: number;
  currency?: string;
  treatments?: string[];
  cancellationReason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Security: Verify the request is coming from an authorized source
    const authHeader = req.headers.get("authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!authHeader) {
      console.error("[Slack] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceRoleKey) {
      console.error("[Slack] Unauthorized: Only service role calls allowed");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_BOOKINGS");
    if (!SLACK_WEBHOOK_URL) {
      console.error("[Slack] SLACK_WEBHOOK_BOOKINGS not configured");
      return new Response(
        JSON.stringify({ error: "Slack webhook not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: SlackNotificationPayload = await req.json();
    console.log("[Slack] Sending notification:", payload.type, "for booking:", payload.bookingNumber);

    const SITE_URL = Deno.env.get("SITE_URL") || "https://app.oomworld.com";
    const bookingUrl = `${SITE_URL}/admin/booking?bookingId=${payload.bookingId}`;

    // Format date
    const formattedDate = new Date(payload.bookingDate).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    const formattedTime = payload.bookingTime?.substring(0, 5) || '';

    // Build message based on type
    let emoji: string;
    let title: string;
    let color: string;

    switch (payload.type) {
      case 'new_booking':
        emoji = "🆕";
        title = "Nouvelle réservation";
        color = "#3498db"; // Blue
        break;
      case 'booking_confirmed':
        emoji = "✅";
        title = "Réservation confirmée";
        color = "#2ecc71"; // Green
        break;
      case 'booking_cancelled':
        emoji = "❌";
        title = "Réservation annulée";
        color = "#e74c3c"; // Red
        break;
    }

    const priceText = payload.totalPrice
      ? `${payload.totalPrice}${payload.currency || '€'}`
      : 'À définir';

    const treatmentsText = payload.treatments?.length
      ? payload.treatments.join(', ')
      : '';

    const cancellationReasonText = payload.cancellationReason || '';

    // Simple Slack message with attachments for color
    const slackMessage = {
      attachments: [
        {
          color: color,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${emoji} ${title} #${payload.bookingNumber}`,
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Client:*\n${payload.clientName}`
                },
                {
                  type: "mrkdwn",
                  text: `*Hôtel:*\n${payload.hotelName}`
                },
                {
                  type: "mrkdwn",
                  text: `*Date:*\n${formattedDate} à ${formattedTime}`
                },
                {
                  type: "mrkdwn",
                  text: `*Coiffeur:*\n${payload.hairdresserName || 'Non assigné'}`
                }
              ]
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Total:*\n${priceText}`
                },
                ...(treatmentsText ? [{
                  type: "mrkdwn",
                  text: `*Prestations:*\n${treatmentsText}`
                }] : [])
              ]
            },
            ...(cancellationReasonText ? [{
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Raison d'annulation:*\n${cancellationReasonText}`
              }
            }] : []),
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Voir la réservation",
                    emoji: true
                  },
                  url: bookingUrl,
                  style: "primary"
                }
              ]
            }
          ]
        }
      ]
    };

    console.log("[Slack] Sending message to webhook...");

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Slack] Error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Slack] ✅ Message sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Slack] Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
