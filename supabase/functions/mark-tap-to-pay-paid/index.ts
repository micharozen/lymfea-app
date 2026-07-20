import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  buildTherapistPayoutLegs,
  fetchPaidTherapistIds,
  fetchPayoutTherapists,
} from "../_shared/therapistPayouts.ts";

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
  therapistShare: number;
  therapistCommissionRate: number;
  lymfeaShare: number;
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
        therapist_id,
        guest_count,
        is_out_of_hours,
        client_email,
        client_first_name,
        client_last_name,
        room_number,
        status,
        payment_status,
        total_price,
        gift_amount_applied_cents,
        booking_treatments(
          treatment_id,
          therapist_id,
          is_addon,
          treatment_menus(name, price, duration)
        ),
        hotels(
          name,
          vat,
          hotel_commission,
          currency,
          venue_type,
          out_of_hours_surcharge_percent
        ),
        therapists(
          first_name,
          last_name,
          rate_60,
          rate_75,
          rate_90
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
      therapist: booking.therapists
        ? `${booking.therapists.first_name} ${booking.therapists.last_name}`
        : 'none',
    });

    // 2. Calculate commissions (same logic as finalize-payment)
    const vatRate = hotel.vat || 20;
    const hotelCommissionRate = hotel.hotel_commission || 10;

    const totalTTC = final_amount;
    // Commissions always based on the gross price (before gift card deduction)
    // so that a gift card discount never reduces therapist earnings.
    const grossTTC = (booking as any).total_price || final_amount;
    const grossHT = grossTTC / (1 + vatRate / 100);
    const tvaAmount = totalTTC - totalTTC / (1 + vatRate / 100);

    const hotelCommission = grossHT * (hotelCommissionRate / 100);

    // Per-therapist payout allocation (duo → each therapist on their own soin;
    // solo → single therapist on the total duration), with out-of-hours surcharge
    // and an aggregate cap of grossHT − hotelCommission.
    const payoutTherapists = await fetchPayoutTherapists(supabase, booking.id, booking.therapist_id);
    const payoutTreatments = (booking.booking_treatments || []).map((bt: any) => ({
      duration: bt.treatment_menus?.duration ?? null,
      therapist_id: bt.therapist_id ?? null,
      is_addon: bt.is_addon ?? false,
    }));
    const { legs: payoutLegs, totalEarned, totalAmount } = buildTherapistPayoutLegs({
      therapists: payoutTherapists,
      treatments: payoutTreatments,
      guestCount: (booking as any).guest_count ?? 1,
      isOutOfHours: !!(booking as any).is_out_of_hours,
      surchargePercent: Number((hotel as any).out_of_hours_surcharge_percent ?? 0) || 0,
      capTotal: grossHT - hotelCommission,
    });

    if (payoutTherapists.length > 0 && totalEarned === 0) {
      throw new Error(
        `Tarifs thérapeute incomplets ou durée invalide pour le booking ${booking_id}`,
      );
    }

    const therapistShare = totalAmount;
    const lymfeaShare = grossHT - hotelCommission - therapistShare;

    const breakdown: CommissionBreakdown = {
      totalTTC,
      totalHT: Math.round(grossHT * 100) / 100,
      tvaAmount: Math.round(tvaAmount * 100) / 100,
      tvaRate: vatRate,
      hotelCommission: Math.round(hotelCommission * 100) / 100,
      hotelCommissionRate,
      therapistShare: Math.round(therapistShare * 100) / 100,
      therapistCommissionRate: 0,
      lymfeaShare: Math.round(lymfeaShare * 100) / 100,
    };

    log("Commission breakdown", breakdown);

    // 3. Record therapist payouts (no Stripe transfer - therapist collected
    // directly). Duo → one row per therapist. Skip therapists already paid.
    const paidTherapistIds = await fetchPaidTherapistIds(supabase, booking.id);
    for (const leg of payoutLegs) {
      if (paidTherapistIds.has(leg.therapistId)) {
        log("Therapist already paid, skipping", { therapist_id: leg.therapistId });
        continue;
      }
      if (leg.amount <= 0) continue;
      await supabase
        .from('therapist_payouts')
        .insert({
          therapist_id: leg.therapistId,
          booking_id: booking.id,
          amount: leg.amount,
          status: 'completed',
          stripe_transfer_id: null,
        });

      log("Therapist payout recorded", { therapist_id: leg.therapistId, amount: leg.amount });
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
        payment_method: 'card_on_site',
        total_price: grossTTC,
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
      payment_method: 'card_on_site',
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
