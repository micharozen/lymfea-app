import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();

    // 1. Récupération de la session et des metadata
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'setup_intent.payment_method'] });
    const meta = session.metadata || {};

    // On regarde dans booking_payment_infos si la session existe déjà
    const { data: existingPaymentInfo } = await supabaseAdmin
      .from('booking_payment_infos')
      .select('booking_id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingPaymentInfo) {
      console.log("[CONFIRM-SETUP] Réservation déjà existante pour cette session :", existingPaymentInfo.booking_id);
      return new Response(JSON.stringify({ success: true, bookingId: existingPaymentInfo.booking_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!meta.hotelId) throw new Error("Données de réservation introuvables dans la session Stripe.");

    const treatmentIds = JSON.parse(meta.treatmentIds || "[]");

    // 2. Calcul prix/durée
    const { data: treatments } = await supabaseAdmin.from('treatment_menus').select('price, duration').in('id', treatmentIds);
    const verifiedPrice = (treatments || []).reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = (treatments || []).reduce((sum, t) => sum + (t.duration || 0), 0) || 30;
    
    const { data: hotel } = await supabaseAdmin.from('hotels').select('name').eq('id', meta.hotelId).maybeSingle();

    // 🌟 CORRECTION CRUCIALE : GESTION DU CLIENT STRIPE 🌟
    // On récupère le client Stripe de la session et on le lie dans notre table Supabase 'customers'
    let customerId = null;
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (meta.clientEmail) {
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('email', meta.clientEmail)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // On met à jour son ID Stripe si on ne l'avait pas
        if (stripeCustomerId) {
          await supabaseAdmin.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', customerId);
        }
      } else {
        // On crée le client s'il n'existe pas
        const { data: newCustomer } = await supabaseAdmin
          .from('customers')
          .insert({
            first_name: meta.firstName,
            last_name: meta.lastName,
            email: meta.clientEmail,
            phone: meta.phone,
            stripe_customer_id: stripeCustomerId
          })
          .select('id')
          .single();
        if (newCustomer) customerId = newCustomer.id;
      }
    }

    // 3. Création/mise à jour de la réservation
    let bookingId: string;

    if (meta.draftBookingId) {
      // The slot is already held — update the draft booking with real client data
      const { data: draftBooking, error: draftFetchError } = await supabaseAdmin
        .from('bookings')
        .select('id')
        .eq('id', meta.draftBookingId)
        .eq('hotel_id', meta.hotelId)
        .eq('status', 'awaiting_payment')
        .single();

      if (draftFetchError || !draftBooking) {
        console.warn("[CONFIRM-SETUP] Draft expired, falling back to atomic reserve");
        // Fall through to atomic reserve
        const { data: fallbackId, error: fallbackError } = await supabaseAdmin.rpc('reserve_trunk_atomically', {
          _booking_date: meta.bookingDate,
          _booking_time: meta.bookingTime,
          _client_email: meta.clientEmail || null,
          _client_first_name: meta.firstName,
          _client_last_name: meta.lastName,
          _client_note: meta.note || null,
          _customer_id: customerId,
          _duration: totalDuration,
          _hotel_id: meta.hotelId,
          _hotel_name: hotel?.name || 'Hotel',
          _language: meta.language || 'fr',
          _payment_method: 'card',
          _payment_status: 'pending',
          _phone: meta.phone,
          _room_number: meta.roomNumber || null,
          _status: 'pending',
          _therapist_gender: meta.therapistGender || null,
          _total_price: verifiedPrice,
          _treatment_ids: treatmentIds
        });
        if (fallbackError) throw new Error(`Désolé, ce créneau vient tout juste d'être réservé (${fallbackError.message})`);
        if (!fallbackId) throw new Error("Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.");
        bookingId = fallbackId;
      } else {
        const { error: updateError } = await supabaseAdmin
          .from('bookings')
          .update({
            client_first_name: meta.firstName,
            client_last_name: meta.lastName,
            client_email: meta.clientEmail || null,
            phone: meta.phone,
            room_number: meta.roomNumber || null,
            client_note: meta.note || null,
            status: 'pending',
            payment_method: 'card',
            payment_status: 'pending',
            total_price: verifiedPrice,
            customer_id: customerId,
            therapist_id: null,
          })
          .eq('id', meta.draftBookingId);

        if (updateError) throw new Error(`Erreur lors de la mise à jour de la réservation : ${updateError.message}`);
        bookingId = meta.draftBookingId;
        console.log("[CONFIRM-SETUP] Draft booking updated:", bookingId);
      }
    } else {
      // No hold — standard atomic reserve
      const { data: newBookingId, error: rpcError } = await supabaseAdmin.rpc('reserve_trunk_atomically', {
        _booking_date: meta.bookingDate,
        _booking_time: meta.bookingTime,
        _client_email: meta.clientEmail || null,
        _client_first_name: meta.firstName,
        _client_last_name: meta.lastName,
        _client_note: meta.note || null,
        _customer_id: customerId,
        _duration: totalDuration,
        _hotel_id: meta.hotelId,
        _hotel_name: hotel?.name || 'Hotel',
        _language: meta.language || 'fr',
        _payment_method: 'card',
        _payment_status: 'pending',
        _phone: meta.phone,
        _room_number: meta.roomNumber || null,
        _status: 'pending',
        _therapist_gender: meta.therapistGender || null,
        _total_price: verifiedPrice,
        _treatment_ids: treatmentIds
      });

      if (rpcError) {
        console.error("[CONFIRM-SETUP] Erreur RPC lors de la réservation :", rpcError);
        throw new Error(`Désolé, ce créneau vient tout juste d'être réservé ou une erreur est survenue (${rpcError.message})`);
      }
      if (!newBookingId) throw new Error("Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.");

      bookingId = newBookingId;
      await supabaseAdmin.from('bookings').update({ therapist_id: null }).eq('id', bookingId);
    }

    if (!bookingId) {
      throw new Error("Impossible de sécuriser le créneau. Veuillez réessayer avec un autre horaire.");
    }

    await supabaseAdmin.from('bookings').update({ therapist_id: null }).eq('id', bookingId);

    // Attacher les soins — nettoyage préalable si c'était un draft pour éviter les doublons
    if (treatmentIds && treatmentIds.length > 0) {
      if (meta.draftBookingId) {
        await supabaseAdmin
          .from('booking_treatments')
          .delete()
          .eq('booking_id', bookingId);
      }

      const treatmentInserts = treatmentIds.map((id: string) => ({
        booking_id: bookingId,
        treatment_id: id,
        variant_id: null,
      }));

      if (treatmentInserts.length > 0) {
        const { error: treatmentsError } = await supabaseAdmin
          .from('booking_treatments')
          .insert(treatmentInserts);

        if (treatmentsError) {
          console.error('[CONFIRM-SETUP] booking_treatments insert error:', treatmentsError);
        }
      }
    }

    // 4. Sauvegarde de la carte dans la nouvelle table
    const setupIntent = session.setup_intent as Stripe.SetupIntent;
    const paymentMethodId = typeof setupIntent?.payment_method === 'string' ? setupIntent.payment_method : (setupIntent?.payment_method as Stripe.PaymentMethod)?.id;
    const paymentMethodCard = typeof setupIntent?.payment_method !== 'string' ? (setupIntent?.payment_method as Stripe.PaymentMethod)?.card : null;
    
    if (paymentMethodId && setupIntent) {
      await supabaseAdmin.from('booking_payment_infos').insert({
        booking_id: bookingId,
        customer_id: customerId, // <--- Et on relie le paiement au client
        stripe_payment_method_id: paymentMethodId,
        stripe_setup_intent_id: setupIntent.id,
        stripe_session_id: sessionId,
        card_brand: paymentMethodCard?.brand || null,
        card_last4: paymentMethodCard?.last4 || null,
        estimated_price: verifiedPrice,
        payment_status: 'card_saved'
      });
    }

    return new Response(JSON.stringify({ success: true, bookingId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[CONFIRM-SETUP] Erreur :", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});