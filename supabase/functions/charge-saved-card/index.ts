import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculateCommission } from "../_shared/commission.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CHARGE-SAVED-CARD] Starting deferred payment");

    const { bookingId, finalAmount } = await req.json();

    if (!bookingId || !finalAmount || finalAmount <= 0) {
      throw new Error("Missing bookingId or valid finalAmount");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // =========================================================================
    // 1. RÉCUPÉRATION DES DONNÉES (Booking, Hôtel, Thérapeute, Empreinte CB)
    // =========================================================================
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        hotels ( id, name, currency, vat, hotel_commission, therapist_commission, global_therapist_commission ),
        therapists ( id, first_name, last_name, stripe_account_id, hourly_rate, rate_45, rate_60, rate_90 ),
        customers ( id, stripe_customer_id ),
        booking_payment_infos ( id, stripe_payment_method_id, payment_status ),
        booking_treatments ( treatment_id, treatment_menus ( duration ) )
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    const paymentInfo = booking.booking_payment_infos;
    
    if (!paymentInfo || !paymentInfo.stripe_payment_method_id) {
      throw new Error("Aucune carte enregistrée trouvée pour cette réservation.");
    }
    
    if (booking.payment_status === 'paid' || paymentInfo.payment_status === 'charged') {
      throw new Error("Cette réservation a déjà été payée.");
    }

    const stripeCustomerId = booking.customers?.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new Error("Le client n'a pas d'identifiant Stripe (Customer ID).");
    }

    const currency = (booking.hotels?.currency || 'EUR').toLowerCase();

    // =========================================================================
    // 2. DÉBITER LA CARTE VIA STRIPE (Off Session)
    // =========================================================================
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(finalAmount * 100), // En centimes
        currency: currency,
        customer: stripeCustomerId,
        payment_method: paymentInfo.stripe_payment_method_id,
        off_session: true, // 🚨 CRUCIAL: Indique que le client n'est pas devant son écran
        confirm: true,     // On confirme immédiatement le paiement
        description: `Paiement différé - Réservation #${booking.booking_id} chez ${booking.hotels?.name}`,
        metadata: {
          booking_id: booking.id,
          hotel_id: booking.hotel_id,
          source: 'charge-saved-card'
        }
      });
      console.log("[CHARGE-SAVED-CARD] PaymentIntent created & confirmed:", paymentIntent.id);
    } catch (stripeError: any) {
      console.error("[CHARGE-SAVED-CARD] Stripe Charge Failed:", stripeError);
      
      // Mettre à jour le statut en "failed" pour que le thérapeute sache que ça a raté
      await supabase.from('booking_payment_infos')
        .update({ 
          payment_status: 'failed', 
          payment_error_message: stripeError.message 
        })
        .eq('id', paymentInfo.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Le paiement a été refusé par la banque.", 
          details: stripeError.message,
          requiresAction: stripeError.code === 'authentication_required' // 3DS nécessaire
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // =========================================================================
    // 3. CALCUL DES COMMISSIONS (Via le script partagé)
    // =========================================================================
    const breakdown = calculateCommission(
      finalAmount,
      booking.hotels,
      booking.therapists,
      booking.booking_treatments
    );

    // =========================================================================
    // 4. MISE À JOUR DE LA BASE DE DONNÉES (Succès)
    // =========================================================================
    
    // A. Mettre à jour la table annexe
    await supabase.from('booking_payment_infos')
      .update({
        payment_status: 'charged',
        stripe_payment_intent_id: paymentIntent.id,
        payment_at: new Date().toISOString()
      })
      .eq('id', paymentInfo.id);

    // B. Mettre à jour le booking (Statut terminé + payé)
    await supabase.from('bookings')
      .update({
        status: 'Terminé',
        payment_status: 'paid',
        total_price: finalAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    // C. Payout Thérapeute (Cash Advance)
    let transferResult = null;
    if (booking.therapists?.stripe_account_id && breakdown.therapistShare > 0) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(breakdown.therapistShare * 100),
          currency: currency,
          destination: booking.therapists.stripe_account_id,
          transfer_group: `booking_${booking.booking_id}`,
          metadata: { booking_id: booking.id, type: 'cash_advance', payment_method: 'card_saved' },
        });

        await supabase.from('therapist_payouts').insert({
          therapist_id: booking.therapist_id,
          booking_id: booking.id,
          amount: breakdown.therapistShare,
          stripe_transfer_id: transfer.id,
          status: 'completed',
        });
        transferResult = { success: true, transfer_id: transfer.id };
      } catch (err: any) {
        console.error("[CHARGE-SAVED-CARD] Transfer failed:", err.message);
        await supabase.from('therapist_payouts').insert({
          therapist_id: booking.therapist_id,
          booking_id: booking.id,
          amount: breakdown.therapistShare,
          status: 'failed',
          error_message: err.message,
        });
      }
    }

    // D. Hotel Ledger (Dette de l'hôtel envers Lymfea)
    const hotelCommissionTTC = breakdown.hotelCommission * (1 + breakdown.tvaRate / 100);
    const ledgerAmount = finalAmount - hotelCommissionTTC;
    
    await supabase.from('hotel_ledger').insert({
      hotel_id: booking.hotel_id,
      booking_id: booking.id,
      amount: ledgerAmount,
      status: 'pending',
      description: `Réservation #${booking.booking_id} (Paiement différé cb) - ${booking.client_first_name} ${booking.client_last_name}`,
    });

    // =========================================================================
    // 5. NOTIFICATIONS (Optionnel : prévenir le concierge de la fin du soin)
    // =========================================================================
    try {
      await supabase.functions.invoke('notify-concierge-completion', {
        body: { bookingId: booking.id }
      });
    } catch (e) {
      console.error("[CHARGE-SAVED-CARD] Notification failed:", e);
    }

    console.log("[CHARGE-SAVED-CARD] All done successfully!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        transfer: transferResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("[CHARGE-SAVED-CARD] Global Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});