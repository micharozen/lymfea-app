import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendWhatsAppInteractive,
  buildAlternativeSlotOffer1Message,
} from "../_shared/whatsapp-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProposeAlternativeRequest {
  bookingId: string;
  hairdresserId: string;
  alternative1: {
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
  };
  alternative2: {
    date: string;
    time: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ProposeAlternativeRequest = await req.json();
    const { bookingId, hairdresserId, alternative1, alternative2 } = body;

    console.log("Proposing alternative for booking:", bookingId);

    // Validate required fields
    if (!bookingId || !hairdresserId || !alternative1 || !alternative2) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, hotels(name)")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking fetch error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate booking is in pending status
    if (booking.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Booking is not in pending status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if there's already an active proposal for this booking
    const { data: existingProposal } = await supabase
      .from("booking_alternative_proposals")
      .select("id")
      .eq("booking_id", bookingId)
      .in("status", ["pending", "slot1_offered", "slot1_rejected", "slot2_offered"])
      .single();

    if (existingProposal) {
      return new Response(
        JSON.stringify({ error: "An active proposal already exists for this booking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate client phone number
    if (!booking.phone) {
      return new Response(
        JSON.stringify({ error: "Client phone number is missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the proposal record
    const { data: proposal, error: proposalError } = await supabase
      .from("booking_alternative_proposals")
      .insert({
        booking_id: bookingId,
        hairdresser_id: hairdresserId,
        original_date: booking.booking_date,
        original_time: booking.booking_time,
        alternative_1_date: alternative1.date,
        alternative_1_time: alternative1.time,
        alternative_2_date: alternative2.date,
        alternative_2_time: alternative2.time,
        status: "pending",
        client_phone: booking.phone,
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Proposal creation error:", proposalError);
      return new Response(
        JSON.stringify({ error: "Failed to create proposal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update booking status to alternative_proposed
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "alternative_proposed" })
      .eq("id", bookingId);

    if (updateError) {
      console.error("Booking update error:", updateError);
      // Rollback proposal
      await supabase.from("booking_alternative_proposals").delete().eq("id", proposal.id);
      return new Response(
        JSON.stringify({ error: "Failed to update booking status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send WhatsApp message with first alternative
    const clientName = `${booking.client_first_name} ${booking.client_last_name || ""}`.trim();
    const message = buildAlternativeSlotOffer1Message(
      clientName,
      booking.booking_date,
      booking.booking_time,
      alternative1.date,
      alternative1.time
    );

    const whatsappResult = await sendWhatsAppInteractive(booking.phone, message);

    if (!whatsappResult.success) {
      console.error("WhatsApp send error:", whatsappResult.error);
      // Update proposal status to reflect the error but don't rollback
      await supabase
        .from("booking_alternative_proposals")
        .update({ status: "slot1_offered" })
        .eq("id", proposal.id);

      return new Response(
        JSON.stringify({
          success: true,
          proposalId: proposal.id,
          warning: "Proposal created but WhatsApp message failed to send",
          whatsappError: whatsappResult.error,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update proposal with WhatsApp message ID and status
    await supabase
      .from("booking_alternative_proposals")
      .update({
        status: "slot1_offered",
        whatsapp_message_id: whatsappResult.messageId,
      })
      .eq("id", proposal.id);

    console.log("Alternative proposal sent successfully:", proposal.id);

    return new Response(
      JSON.stringify({
        success: true,
        proposalId: proposal.id,
        messageId: whatsappResult.messageId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in propose-alternative:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
