import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (message: string, data?: any) => {
  console.log(`[mark-tap-to-pay-paid] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

interface MarkTapToPayPaidRequest {
  booking_id: string;
  final_amount: number;
}

interface CommissionBreakdown {
  totalTTC: number;
  totalHT: number;
  tvaAmount: number;
  tvaRate: number;
  hotelCommission: number;
  hotelCommissionRate: number;
  hairdresserShare: number;
  hairdresserCommissionRate: number;
  oomShare: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id, final_amount }: MarkTapToPayPaidRequest = await req.json();

    log("Request received", { booking_id, final_amount });

    // Validation
    if (!booking_id || !final_amount) {
      throw new Error("Missing required fields: booking_id, final_amount");
    }

    if (final_amount <= 0) {
      throw new Error("Final amount must be positive");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Fetch booking with relations
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_id,
        hotel_id,
        hairdresser_id,
        client_email,
        client_first_name,
        client_last_name,
        room_number,
        status,
        payment_status,
        booking_treatments(
          treatment_id,
          treatment_menus(name, price)
        ),
        hotels(
          name,
          vat,
          hotel_commission,
          hairdresser_commission,
          currency,
          venue_type
        ),
        hairdressers(
          first_name,
          last_name
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      log("Booking not found", { bookingError });
      throw new Error(`Booking not found: ${booking_id}`);
    }

    // Guard: booking must not already be completed
    if (booking.status === 'completed' || booking.status === 'Terminé') {
      throw new Error("Booking is already completed");
    }

    if (booking.payment_status === 'paid') {
      throw new Error("Booking is already paid");
    }

    const hotel = booking.hotels;
    if (!hotel) {
      throw new Error(`Hotel not found for booking: ${booking_id}`);
    }

    log("Booking found", {
      booking_id: booking.booking_id,
      hotel_name: hotel.name,
      hairdresser: booking.hairdressers
        ? `${booking.hairdressers.first_name} ${booking.hairdressers.last_name}`
        : 'none',
    });

    // 2. Calculate commissions (same logic as finalize-payment)
    const vatRate = hotel.vat || 20;
    const hotelCommissionRate = hotel.hotel_commission || 10;
    const hairdresserCommissionRate = hotel.hairdresser_commission || 70;

    const totalTTC = final_amount;
    const totalHT = totalTTC / (1 + vatRate / 100);
    const tvaAmount = totalTTC - totalHT;

    const hotelCommission = totalHT * (hotelCommissionRate / 100);
    const hairdresserShare = totalHT * (hairdresserCommissionRate / 100);
    const oomShare = totalHT - hotelCommission - hairdresserShare;

    const breakdown: CommissionBreakdown = {
      totalTTC,
      totalHT: Math.round(totalHT * 100) / 100,
      tvaAmount: Math.round(tvaAmount * 100) / 100,
      tvaRate: vatRate,
      hotelCommission: Math.round(hotelCommission * 100) / 100,
      hotelCommissionRate,
      hairdresserShare: Math.round(hairdresserShare * 100) / 100,
      hairdresserCommissionRate,
      oomShare: Math.round(oomShare * 100) / 100,
    };

    log("Commission breakdown", breakdown);

    // 3. Record hairdresser payout (no Stripe transfer - hairdresser collected directly)
    if (booking.hairdresser_id) {
      await supabase
        .from('hairdresser_payouts')
        .insert({
          hairdresser_id: booking.hairdresser_id,
          booking_id: booking.id,
          amount: breakdown.hairdresserShare,
          status: 'completed',
          stripe_transfer_id: null,
        });

      log("Hairdresser payout recorded", { amount: breakdown.hairdresserShare });
    }

    // 4. Record hotel ledger entry (same formula as finalize-payment)
    const hotelCommissionTTC = breakdown.hotelCommission * (1 + vatRate / 100);
    const ledgerAmount = totalTTC - hotelCommissionTTC;

    await supabase
      .from('hotel_ledger')
      .insert({
        hotel_id: booking.hotel_id,
        booking_id: booking.id,
        amount: ledgerAmount,
        status: 'pending',
        description: `Réservation #${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name} - Tap to Pay`,
      });

    log("Ledger entry created", { amount: ledgerAmount });

    // 5. Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: 'tap_to_pay',
        total_price: totalTTC,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    if (updateError) {
      log("Failed to update booking", { error: updateError.message });
      throw new Error(`Failed to update booking: ${updateError.message}`);
    }

    log("Booking updated to completed/paid");

    // 6. Notify concierge (non-blocking)
    try {
      await supabase.functions.invoke('notify-concierge-completion', {
        body: { bookingId: booking.id },
      });
      log("Concierge notified");
    } catch (notifyError: any) {
      log("Failed to notify concierge", { error: notifyError.message });
    }

    // 7. Send rating email to client (non-blocking)
    if (booking.client_email) {
      try {
        await supabase.functions.invoke('send-rating-email', {
          body: { bookingId: booking.id },
        });
        log("Rating email sent");
      } catch (ratingError: any) {
        log("Failed to send rating email", { error: ratingError.message });
      }
    }

    const result = {
      success: true,
      payment_method: 'tap_to_pay',
      breakdown,
      ledger_amount: ledgerAmount,
    };

    log("Mark tap-to-pay completed", result);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    log("Error", { message: error.message, stack: error.stack });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
