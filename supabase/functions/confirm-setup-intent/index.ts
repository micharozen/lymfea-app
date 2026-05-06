import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { computeOutOfHoursSurcharge } from '../_shared/surcharge.ts';

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
    const basePrice = (treatments || []).reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = (treatments || []).reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    const { data: hotel } = await supabaseAdmin
      .from('hotels')
      .select('name, opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent')
      .eq('id', meta.hotelId)
      .maybeSingle();

    // Recalcul serveur de la majoration hors horaires
    const surcharge = computeOutOfHoursSurcharge(meta.bookingTime || '', basePrice, hotel || {});
    const verifiedPrice = surcharge.totalWithSurcharge;

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
    const isMulti = meta.is_multi === 'true';
    let targetBookingIds: string[] = [];

    // Récupération des IDs (Soit le tableau Multi, soit l'ID Solo unique)
    if (isMulti && meta.booking_ids) {
      try { targetBookingIds = JSON.parse(meta.booking_ids); } catch (e) {}
    } else if (meta.draftBookingId) {
      targetBookingIds = [meta.draftBookingId];
    }

    const confirmedBookingIds: string[] = [];

    if (targetBookingIds.length > 0) {
      for (const bId of targetBookingIds) {
        // Vérifie si le draft est toujours en attente
        const { data: draftBooking, error: draftFetchError } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('id', bId)
          .eq('hotel_id', meta.hotelId)
          .eq('status', 'awaiting_payment')
          .maybeSingle();

        if (draftBooking) {
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
              // On met à jour le prix total uniquement en Solo (en Multi, le draft a déjà le prix spécifique de son soin)
              ...(!isMulti ? { total_price: verifiedPrice } : {}),
              customer_id: customerId,
              therapist_id: null,
            })
            .eq('id', bId);

          if (updateError) throw new Error(`Erreur mise à jour réservation : ${updateError.message}`);
          
          if (!isMulti) {
            await supabaseAdmin.from('bookings').update({
              is_out_of_hours: surcharge.isOutOfHours,
              surcharge_amount: surcharge.surchargeAmount,
            }).eq('id', bId);
          }

          confirmedBookingIds.push(bId);
        } else {
          // GESTION FALLBACK (si le draft a expiré)
          if (isMulti) {
            throw new Error("Un des créneaux a expiré pendant le paiement.");
          } else {
            console.warn("[CONFIRM-SETUP] Draft expired, falling back to atomic reserve");
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
            
            confirmedBookingIds.push(fallbackId);
          }
        }
      }
    } else if (isMulti && meta.booking_dates) {
      // Multi sans hold : créer N réservations atomiques d'après les tableaux de créneaux
      const dates = JSON.parse(meta.booking_dates) as string[];
      const times = JSON.parse(meta.booking_times || '[]') as string[];
      const slotTreatmentIds = JSON.parse(meta.treatment_ids_per_slot || '[]') as string[];
      const slotVariantIds = JSON.parse(meta.variant_ids_per_slot || '[]') as string[];
      const slotDurations = JSON.parse(meta.durations_per_slot || '[]') as number[];
      const slotQuantities = JSON.parse(meta.quantities_per_slot || '[]') as number[];
      const slotGuestCounts = JSON.parse(meta.guest_counts_per_slot || '[]') as number[];
      const multiGroupId = meta.group_id || crypto.randomUUID();

      const uniqueTreatmentIds = [...new Set(slotTreatmentIds.filter(Boolean))];
      const uniqueVariantIds = [...new Set(slotVariantIds.filter((v: string) => v))];

      const [{ data: slotTreatmentsData }, { data: slotVariantsData }] = await Promise.all([
        uniqueTreatmentIds.length > 0
          ? supabaseAdmin.from('treatment_menus').select('id, price').in('id', uniqueTreatmentIds)
          : Promise.resolve({ data: [] as { id: string; price: number }[] }),
        uniqueVariantIds.length > 0
          ? supabaseAdmin.from('treatment_variants').select('id, price').in('id', uniqueVariantIds)
          : Promise.resolve({ data: [] as { id: string; price: number }[] }),
      ]);

      const txPriceMap = new Map((slotTreatmentsData || []).map((t: { id: string; price: number }) => [t.id, t.price]));
      const varPriceMap = new Map((slotVariantsData || []).map((v: { id: string; price: number }) => [v.id, v.price]));

      const slotCreatedIds: string[] = [];

      for (let i = 0; i < dates.length; i++) {
        const slotVariantId = slotVariantIds[i] || null;
        const qty = slotQuantities[i] || 1;
        const baseUnitPrice = slotVariantId
          ? Number(varPriceMap.get(slotVariantId) ?? 0)
          : Number(txPriceMap.get(slotTreatmentIds[i]) ?? 0);
        const rawPrice = baseUnitPrice * qty;
        const slotSurcharge = computeOutOfHoursSurcharge(times[i], rawPrice, hotel || {});

        const { data: newId, error: rpcError } = await supabaseAdmin.rpc('reserve_trunk_atomically', {
          _booking_date: dates[i],
          _booking_time: times[i],
          _client_email: meta.clientEmail || null,
          _client_first_name: meta.firstName,
          _client_last_name: meta.lastName,
          _client_note: meta.note || null,
          _customer_id: customerId,
          _duration: slotDurations[i] || 60,
          _hotel_id: meta.hotelId,
          _hotel_name: hotel?.name || 'Hotel',
          _language: meta.language || 'fr',
          _payment_method: 'card',
          _payment_status: 'pending',
          _phone: meta.phone,
          _room_number: meta.roomNumber || null,
          _status: 'pending',
          _therapist_gender: meta.therapistGender || null,
          _total_price: slotSurcharge.totalWithSurcharge,
          _treatment_ids: [slotTreatmentIds[i]].filter(Boolean),
          _guest_count: slotGuestCounts[i] || 1,
        });

        if (rpcError || !newId) {
          if (slotCreatedIds.length > 0) {
            await supabaseAdmin.from('bookings').delete().in('id', slotCreatedIds);
          }
          throw new Error(`Un créneau (${dates[i]} ${times[i]}) vient d'être pris. Veuillez choisir un autre horaire.`);
        }

        await supabaseAdmin.from('bookings').update({
          booking_group_id: multiGroupId,
          therapist_id: null,
          is_out_of_hours: slotSurcharge.isOutOfHours,
          surcharge_amount: slotSurcharge.surchargeAmount,
        }).eq('id', newId);

        await supabaseAdmin.from('booking_treatments').insert({
          booking_id: newId,
          treatment_id: slotTreatmentIds[i],
          variant_id: slotVariantId,
        });

        slotCreatedIds.push(newId);
        confirmedBookingIds.push(newId);
      }
    } else {
      // Cas sans draft du tout (Solo Atomic reserve direct)
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

      if (rpcError) throw new Error(`Désolé, ce créneau vient tout juste d'être réservé (${rpcError.message})`);
      if (!newBookingId) throw new Error("Impossible de sécuriser le créneau.");

      await supabaseAdmin.from('bookings').update({
        therapist_id: null,
        is_out_of_hours: surcharge.isOutOfHours,
        surcharge_amount: surcharge.surchargeAmount,
      }).eq('id', newBookingId);

      confirmedBookingIds.push(newBookingId);
    }

    if (confirmedBookingIds.length === 0) {
      throw new Error("Aucune réservation n'a pu être confirmée.");
    }

    // Attacher les soins (Uniquement en SOLO, car en MULTI la création des drafts s'en est déjà chargé)
    if (!isMulti && treatmentIds && treatmentIds.length > 0) {
      const bId = confirmedBookingIds[0];
      await supabaseAdmin.from('booking_treatments').delete().eq('booking_id', bId);
      
      const treatmentInserts = treatmentIds.map((id: string) => ({
        booking_id: bId,
        treatment_id: id,
        variant_id: null,
      }));

      if (treatmentInserts.length > 0) {
        await supabaseAdmin.from('booking_treatments').insert(treatmentInserts);
      }
    }

    // 4. Sauvegarde de la carte dans la nouvelle table
    const setupIntent = session.setup_intent as Stripe.SetupIntent;
    const paymentMethodId = typeof setupIntent?.payment_method === 'string' ? setupIntent.payment_method : (setupIntent?.payment_method as Stripe.PaymentMethod)?.id;
    const paymentMethodCard = typeof setupIntent?.payment_method !== 'string' ? (setupIntent?.payment_method as Stripe.PaymentMethod)?.card : null;
    
    if (paymentMethodId && setupIntent) {
      // On insère l'empreinte bancaire pour CHAQUE réservation confirmée
      for (const bId of confirmedBookingIds) {
        
        // CORRECTION : On récupère le VRAI prix du soin depuis la table bookings
        const { data: bData } = await supabaseAdmin
          .from('bookings')
          .select('total_price')
          .eq('id', bId)
          .single();

        await supabaseAdmin.from('booking_payment_infos').insert({
          booking_id: bId,
          customer_id: customerId, 
          stripe_payment_method_id: paymentMethodId,
          stripe_setup_intent_id: setupIntent.id,
          stripe_session_id: sessionId,
          card_brand: paymentMethodCard?.brand || null,
          card_last4: paymentMethodCard?.last4 || null,
          estimated_price: bData?.total_price || verifiedPrice, // <- Le bon prix est ici !
          payment_status: 'card_saved'
        });
      }
    }

    // 5. Déclenchement des notifications push pour chaque réservation validée !
    for (const bId of confirmedBookingIds) {
      try {
        await supabaseAdmin.functions.invoke('trigger-new-booking-notifications', {
          body: { bookingId: bId, notifyAll: true }
        });
      } catch (notifError) {
        console.error(`[CONFIRM-SETUP] Erreur push notif pour ${bId}:`, notifError);
      }
    }

    return new Response(JSON.stringify({ success: true, bookingId: confirmedBookingIds[0] }), {
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