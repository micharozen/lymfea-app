import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    console.log("[VERIFY-PAYMENT-LINK] --- DEBUT DE LA VERIFICATION ---");
    const { sessionId, bookingId } = await req.json();

    if (!sessionId || !bookingId) throw new Error('Missing sessionId or bookingId');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2025-08-27.basil' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Vérifier le paiement Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log(`[VERIFY-PAYMENT-LINK] Statut Stripe : ${session.payment_status}`);

    if (session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ success: false, reason: 'not_paid' }), { headers: corsHeaders, status: 200 });
    }

    // 2. Récupérer le booking (idempotency + données pour email)
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, booking_id, payment_status,
        client_email, client_first_name, client_last_name,
        room_number, booking_date, booking_time, total_price,
        hotel_id, hotel_name
      `)
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) throw new Error(`Booking not found: ${bookingId}`);

    if (booking.payment_status === 'paid') {
      console.log(`[VERIFY-PAYMENT-LINK] Booking ${bookingId} déjà payé, on ignore.`);
      return new Response(JSON.stringify({ success: true, alreadyPaid: true }), { headers: corsHeaders, status: 200 });
    }

    // 3. Mettre à jour la base de données
    console.log(`[VERIFY-PAYMENT-LINK] Mise à jour DB pour booking : ${bookingId}`);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        stripe_invoice_url: sessionId,
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Sauvegarder l'email du payeur Stripe si le booking n'en avait pas
    if (!booking.client_email && session.customer_details?.email) {
      await supabase.from('bookings')
        .update({ client_email: session.customer_details.email })
        .eq('id', bookingId);
      console.log(`[VERIFY-PAYMENT-LINK] Email payeur sauvegardé : ${session.customer_details.email}`);
    }

    console.log("[VERIFY-PAYMENT-LINK] ✅ Base de données mise à jour !");

    // 4. Désactiver le lien Stripe (non-bloquant)
    try {
      const { data: paymentInfo } = await supabase
        .from('booking_payment_infos')
        .select('payment_link_stripe_id')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (paymentInfo?.payment_link_stripe_id?.startsWith('plink_')) {
        await stripe.paymentLinks.update(paymentInfo.payment_link_stripe_id, { active: false });
        console.log("[VERIFY-PAYMENT-LINK] ✅ Lien Stripe désactivé !");
      }
    } catch (_e) {
      console.warn("[VERIFY-PAYMENT-LINK] Impossible de désactiver le lien (non-bloquant).");
    }

    // 5. Envoyer l'email de confirmation
    // Fallback : si le booking n'a pas d'email, on utilise celui du payeur Stripe
    const recipientEmail = booking.client_email || session.customer_details?.email || null;
    console.log(`[VERIFY-PAYMENT-LINK] client_email booking: "${booking.client_email}" | stripe payer email: "${session.customer_details?.email}" | recipient: "${recipientEmail}"`);

    if (!recipientEmail) {
      console.warn('[VERIFY-PAYMENT-LINK] ⚠️ Aucun email disponible (booking ni Stripe) — email ignoré.');
    } else {
      const [hotelResult, treatmentsResult] = await Promise.all([
        supabase.from('hotels').select('currency').eq('id', booking.hotel_id).single(),
        supabase.from('booking_treatments')
          .select('treatment_menus(name, price, price_on_request)')
          .eq('booking_id', bookingId),
      ]);

      console.log('[VERIFY-PAYMENT-LINK] hotel:', hotelResult.data, hotelResult.error?.message);
      console.log('[VERIFY-PAYMENT-LINK] booking_treatments:', treatmentsResult.data?.length, 'items | error:', treatmentsResult.error?.message);

      const currency = (hotelResult.data?.currency || 'EUR').toUpperCase();
      const treatmentsForEmail = (treatmentsResult.data || []).map((bt: { treatment_menus?: { name?: string; price?: number; price_on_request?: boolean } }) => ({
        name: bt.treatment_menus?.name,
        price: bt.treatment_menus?.price,
        isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
      }));

      const emailPayload = {
        email: recipientEmail,
        bookingId: booking.id,
        bookingNumber: booking.booking_id.toString(),
        clientName: `${booking.client_first_name} ${booking.client_last_name || ''}`.trim(),
        hotelName: booking.hotel_name,
        roomNumber: booking.room_number,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        treatments: treatmentsForEmail,
        totalPrice: booking.total_price,
        currency,
        siteUrl: Deno.env.get('SITE_URL') || 'https://lymfea.fr',
      };

      console.log('[VERIFY-PAYMENT-LINK] Appel send-booking-confirmation avec:', JSON.stringify(emailPayload));

      const emailTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Email timeout after 8s')), 8000)
      );

      const { data: emailData, error: emailError } = await Promise.race([
        supabase.functions.invoke('send-booking-confirmation', { body: emailPayload }),
        emailTimeout.then(() => ({ data: null, error: new Error('timeout') })),
      ]) as { data: unknown; error: Error | null };

      if (emailError) {
        console.error('[VERIFY-PAYMENT-LINK] ❌ send-booking-confirmation error:', emailError.message);
      } else {
        console.log('[VERIFY-PAYMENT-LINK] ✅ Email envoyé. Réponse:', JSON.stringify(emailData));
      }
    }

    console.log("[VERIFY-PAYMENT-LINK] --- FIN AVEC SUCCÈS ---");
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders, status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[VERIFY-PAYMENT-LINK] ❌ ERREUR FATALE:', message);
    return new Response(JSON.stringify({ error: message }), { headers: corsHeaders, status: 500 });
  }
});
