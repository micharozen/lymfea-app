import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not set");
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    console.log(`[STRIPE-WEBHOOK] Event: ${event.type}`);

    // Quand une facture est payée
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      
      console.log(`[STRIPE-WEBHOOK] Invoice paid: ${invoice.id}`);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Récupérer les invoice items pour voir les bookings
      const invoiceItems = await stripe.invoiceItems.list({
        invoice: invoice.id,
      });

      console.log(`[STRIPE-WEBHOOK] Processing ${invoiceItems.data.length} items`);

      // Pour chaque booking dans la facture
      for (const item of invoiceItems.data) {
        const bookingId = item.metadata?.booking_id;
        
        if (!bookingId) continue;

        // Récupérer le booking et les infos du coiffeur
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            *,
            hairdresser:hairdressers!inner(id, stripe_account_id),
            hotel:hotels!inner(hairdresser_commission)
          `)
          .eq('id', bookingId)
          .single();

        if (bookingError || !booking) {
          console.error(`[STRIPE-WEBHOOK] Booking not found: ${bookingId}`);
          continue;
        }

        console.log(`[STRIPE-WEBHOOK] Processing booking ${booking.booking_id}`);

        // Vérifier que le coiffeur a un compte Stripe Connect
        if (!booking.hairdresser?.stripe_account_id) {
          console.error(`[STRIPE-WEBHOOK] Hairdresser has no Stripe Connect account for booking ${booking.booking_id}`);
          continue;
        }

        // Calculer la part du coiffeur (ex: 70%)
        const hairdresserCommission = booking.hotel.hairdresser_commission || 70;
        const hairdresserAmount = Math.round((booking.total_price * hairdresserCommission) / 100);

          // Calculer la commission OOM (ce qui reste après le coiffeur)
          const oomCommission = booking.total_price - hairdresserAmount;

          // Transférer au coiffeur via Stripe Connect
          try {
            const transfer = await stripe.transfers.create({
              amount: hairdresserAmount * 100, // Stripe utilise les centimes
              currency: invoice.currency,
              destination: booking.hairdresser.stripe_account_id,
              description: `Paiement pour réservation #${booking.booking_id}`,
              metadata: {
                booking_id: booking.id,
                invoice_id: invoice.id,
              },
            });

            console.log(`[STRIPE-WEBHOOK] Transfer created: ${transfer.id} - ${hairdresserAmount}€`);

            // Créer l'entrée dans le ledger (positif = recette pour OOM)
            const { error: ledgerError } = await supabase
              .from('hotel_ledger')
              .insert({
                hotel_id: booking.hotel_id,
                booking_id: booking.id,
                amount: oomCommission,
                status: 'paid',
                description: `Paiement carte - Réservation #${booking.booking_id}`,
              });

            if (ledgerError) {
              console.error(`[STRIPE-WEBHOOK] Ledger entry failed:`, ledgerError);
            } else {
              console.log(`[STRIPE-WEBHOOK] Ledger entry created: ${oomCommission}€ for hotel ${booking.hotel_id}`);
            }

            // Mettre à jour le statut du paiement dans la DB
            await supabase
              .from('bookings')
              .update({ payment_status: 'paid' })
              .eq('id', bookingId);

          } catch (transferError) {
            console.error(`[STRIPE-WEBHOOK] Transfer failed for booking ${booking.booking_id}:`, transferError);
          }
      }
    }

    // Gérer les paiements carte directs (mode payment)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Si c'est un paiement one-time (pas une subscription)
      if (session.mode === "payment" && session.metadata?.booking_id) {
        console.log(`[STRIPE-WEBHOOK] Card payment for booking: ${session.metadata.booking_id}`);

        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            *,
            hairdresser:hairdressers!inner(id, stripe_account_id),
            hotel:hotels!inner(hairdresser_commission)
          `)
          .eq('id', session.metadata.booking_id)
          .single();

        if (bookingError || !booking) {
          console.error(`[STRIPE-WEBHOOK] Booking not found: ${session.metadata.booking_id}`);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Calculer et transférer au coiffeur
        if (booking.hairdresser?.stripe_account_id) {
          const hairdresserCommission = booking.hotel.hairdresser_commission || 70;
          const hairdresserAmount = Math.round((booking.total_price * hairdresserCommission) / 100);
          const oomCommission = booking.total_price - hairdresserAmount;

          try {
            const transfer = await stripe.transfers.create({
              amount: hairdresserAmount * 100,
              currency: session.currency || 'eur',
              destination: booking.hairdresser.stripe_account_id,
              description: `Paiement carte pour réservation #${booking.booking_id}`,
              metadata: {
                booking_id: booking.id,
                session_id: session.id,
              },
            });

            console.log(`[STRIPE-WEBHOOK] Card payment transfer: ${transfer.id}`);

            // Créer l'entrée dans le ledger (positif = recette pour OOM)
            const { error: ledgerError } = await supabase
              .from('hotel_ledger')
              .insert({
                hotel_id: booking.hotel_id,
                booking_id: booking.id,
                amount: oomCommission,
                status: 'paid',
                description: `Paiement carte - Réservation #${booking.booking_id}`,
              });

            if (ledgerError) {
              console.error(`[STRIPE-WEBHOOK] Ledger entry failed:`, ledgerError);
            } else {
              console.log(`[STRIPE-WEBHOOK] Ledger entry created: ${oomCommission}€`);
            }

            await supabase
              .from('bookings')
              .update({ payment_status: 'paid' })
              .eq('id', booking.id);

          } catch (transferError) {
            console.error(`[STRIPE-WEBHOOK] Card payment transfer failed:`, transferError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[STRIPE-WEBHOOK] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400 }
    );
  }
});
