import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendWhatsAppInteractive,
  buildAlternativeSlotOffer2Message,
  buildSlotAcceptedMessage,
  buildAllRejectedMessage,
  isAcceptResponse,
  isRejectResponse,
} from "../_shared/whatsapp-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Meta webhook payload types
interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        interactive?: {
          type: string;
          button_reply?: {
            id: string;
            title: string;
          };
        };
        text?: {
          body: string;
        };
      }>;
    };
    field: string;
  }>;
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle webhook verification (GET request from Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    } else {
      console.error("Webhook verification failed");
      return new Response("Verification failed", { status: 403 });
    }
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle incoming messages (POST request)
  if (req.method === "POST") {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const payload: MetaWebhookPayload = await req.json();
      console.log("Received webhook payload:", JSON.stringify(payload, null, 2));

      // Validate payload structure
      if (payload.object !== "whatsapp_business_account") {
        return new Response("OK", { status: 200 });
      }

      // Process each entry
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const messages = change.value.messages;
          if (!messages || messages.length === 0) continue;

          for (const message of messages) {
            // Only process interactive button replies
            if (message.type !== "interactive" || !message.interactive?.button_reply) {
              console.log("Ignoring non-interactive message type:", message.type);
              continue;
            }

            const fromPhone = message.from;
            const buttonId = message.interactive.button_reply.id;

            console.log(`Processing button reply from ${fromPhone}: ${buttonId}`);

            // Find active proposal for this phone number
            const { data: proposal, error: proposalError } = await supabase
              .from("booking_alternative_proposals")
              .select("*, bookings(*)")
              .eq("client_phone", fromPhone)
              .in("status", ["slot1_offered", "slot1_rejected", "slot2_offered"])
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (proposalError || !proposal) {
              console.log("No active proposal found for phone:", fromPhone);
              continue;
            }

            console.log("Found proposal:", proposal.id, "status:", proposal.status);

            // Handle response based on current status and button clicked
            // Use helper functions to match button text or payload
            if (proposal.status === "slot1_offered") {
              if (isAcceptResponse(buttonId)) {
                // Client accepted first slot
                await handleSlotAccepted(supabase, proposal, 1);
              } else if (isRejectResponse(buttonId)) {
                // Client rejected first slot, offer second
                await handleSlot1Rejected(supabase, proposal, fromPhone);
              }
            } else if (proposal.status === "slot2_offered") {
              if (isAcceptResponse(buttonId)) {
                // Client accepted second slot
                await handleSlotAccepted(supabase, proposal, 2);
              } else if (isRejectResponse(buttonId)) {
                // Client rejected both slots
                await handleAllRejected(supabase, proposal, fromPhone);
              }
            }
          }
        }
      }

      // Always return 200 to acknowledge receipt
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      // Still return 200 to prevent Meta from retrying
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

// Handle when client accepts a slot
async function handleSlotAccepted(
  supabase: ReturnType<typeof createClient>,
  proposal: any,
  slotNumber: 1 | 2
) {
  const acceptedDate = slotNumber === 1 ? proposal.alternative_1_date : proposal.alternative_2_date;
  const acceptedTime = slotNumber === 1 ? proposal.alternative_1_time : proposal.alternative_2_time;

  console.log(`Client accepted slot ${slotNumber}: ${acceptedDate} ${acceptedTime}`);

  // Update proposal status
  await supabase
    .from("booking_alternative_proposals")
    .update({
      status: slotNumber === 1 ? "slot1_accepted" : "slot2_accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", proposal.id);

  // Update booking with new date/time and confirm it
  await supabase
    .from("bookings")
    .update({
      booking_date: acceptedDate,
      booking_time: acceptedTime,
      status: "confirmed",
      hairdresser_id: proposal.hairdresser_id,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", proposal.booking_id);

  // Fetch hairdresser name for the booking
  const { data: hairdresser } = await supabase
    .from("hairdressers")
    .select("first_name, last_name")
    .eq("id", proposal.hairdresser_id)
    .single();

  if (hairdresser) {
    await supabase
      .from("bookings")
      .update({
        hairdresser_name: `${hairdresser.first_name} ${hairdresser.last_name}`.trim(),
      })
      .eq("id", proposal.booking_id);
  }

  // Send confirmation message to client
  const confirmationMessage = buildSlotAcceptedMessage(acceptedDate, acceptedTime);
  await sendWhatsAppInteractive(proposal.client_phone, confirmationMessage);

  // TODO: Send push notification to hairdresser about acceptance
  console.log(`Booking ${proposal.booking_id} confirmed with slot ${slotNumber}`);
}

// Handle when client rejects first slot
async function handleSlot1Rejected(
  supabase: ReturnType<typeof createClient>,
  proposal: any,
  clientPhone: string
) {
  console.log("Client rejected slot 1, offering slot 2");

  // Update proposal status
  await supabase
    .from("booking_alternative_proposals")
    .update({
      status: "slot1_rejected",
      current_offer_index: 2,
    })
    .eq("id", proposal.id);

  // Send second slot offer
  const message = buildAlternativeSlotOffer2Message(
    proposal.alternative_2_date,
    proposal.alternative_2_time
  );
  const result = await sendWhatsAppInteractive(clientPhone, message);

  if (result.success) {
    await supabase
      .from("booking_alternative_proposals")
      .update({
        status: "slot2_offered",
        whatsapp_message_id: result.messageId,
      })
      .eq("id", proposal.id);
  }
}

// Handle when client rejects both slots
async function handleAllRejected(
  supabase: ReturnType<typeof createClient>,
  proposal: any,
  clientPhone: string
) {
  console.log("Client rejected both slots");

  // Update proposal status
  await supabase
    .from("booking_alternative_proposals")
    .update({
      status: "all_rejected",
      responded_at: new Date().toISOString(),
    })
    .eq("id", proposal.id);

  // Revert booking status back to pending
  await supabase
    .from("bookings")
    .update({ status: "pending" })
    .eq("id", proposal.booking_id);

  // Send "all rejected" message to client
  const message = buildAllRejectedMessage();
  await sendWhatsAppInteractive(clientPhone, message);

  // TODO: Send push notification to hairdresser about rejection
  console.log(`Booking ${proposal.booking_id} reverted to pending after both slots rejected`);
}
