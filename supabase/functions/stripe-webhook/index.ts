import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  sendWhatsAppTemplate,
  buildPaymentConfirmedTemplateMessage,
  formatDateForWhatsApp,
} from '../_shared/whatsapp-meta.ts';
import { brand } from "../_shared/brand.ts";
import { computeTherapistEarnings } from "../_shared/therapistEarnings.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.mode === "payment" && session.payment_status === "paid") {
        console.log(`[STRIPE-WEBHOOK] Processing paid checkout session: ${session.id}`);
        
        const metadata = session.metadata;

        if (metadata?.source === 'payment_link' && metadata?.booking_id) {
          console.log(`[STRIPE-WEBHOOK] Payment link completed for booking: ${metadata.booking_id}`);

          const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select(`
              id,
              booking_id,
              client_email,
              client_first_name,
              client_last_name,
              phone,
              room_number,
              booking_date,
              booking_time,
              total_price,
              hotel_id,
              hotel_name,
              payment_status,
              payment_link_language,
              payment_link_channels
            `)
            .eq('id', metadata.booking_id)
            .single();

          if (fetchError || !booking) {
            throw new Error(`Booking not found: ${metadata.booking_id}`);
          }

          // Idempotency guard — do not process twice
          if (booking.payment_status === 'paid') {
            console.log(`[STRIPE-WEBHOOK] Booking ${metadata.booking_id} already paid, skipping`);
            return new Response(JSON.stringify({ received: true }), { status: 200 });
          }

          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_status: 'paid',
              stripe_invoice_url: session.id
            })
            .eq('id', metadata.booking_id);

          if (updateError) throw updateError;

          console.log(`[STRIPE-WEBHOOK] Booking ${metadata.booking_id} marked as confirmed+paid via payment link`);

          // Deactivate the Stripe Payment Link so it cannot be reused
          try {
            const { data: paymentInfo } = await supabase
              .from('booking_payment_infos')
              .select('payment_link_stripe_id')
              .eq('booking_id', metadata.booking_id)
              .maybeSingle();

            if (paymentInfo?.payment_link_stripe_id) {
              await stripe.paymentLinks.update(paymentInfo.payment_link_stripe_id, { active: false });
              console.log(`[STRIPE-WEBHOOK] Payment link ${paymentInfo.payment_link_stripe_id} deactivated`);
            }
          } catch (deactivateError) {
            console.error('[STRIPE-WEBHOOK] Failed to deactivate payment link:', deactivateError);
          }

          const wasWhatsAppUsed = booking.payment_link_channels?.includes('whatsapp');
          const clientPhone = booking.phone;
          
          let currency = 'EUR';
          if (booking.hotel_id) {
            const { data: hotel } = await supabase
              .from('hotels')
              .select('currency')
              .eq('id', booking.hotel_id)
              .single();
            if (hotel?.currency) currency = hotel.currency.toUpperCase();
          }

          const { data: bookingTreatments } = await supabase
            .from('booking_treatments')
            .select('treatment_menus (name)')
            .eq('booking_id', booking.id);

          const treatmentsList = bookingTreatments
            ?.map(bt => bt.treatment_menus?.name)
            .filter(Boolean)
            .join(', ') || 'Service bien-être';

          if (wasWhatsAppUsed && clientPhone) {
            try {
              const language = (booking.payment_link_language as 'fr' | 'en') || 'fr';
              const formattedDate = formatDateForWhatsApp(booking.booking_date);
              const currencySymbol = currency === 'EUR' ? '€' : currency;
              const amountPaid = `${booking.total_price}${currencySymbol}`;

              const template = buildPaymentConfirmedTemplateMessage(
                language,
                booking.client_first_name,
                amountPaid,
                formattedDate,
                booking.booking_time,
                booking.hotel_name || 'Hotel',
                booking.room_number || '-',
                booking.booking_id,
                treatmentsList
              );

              await sendWhatsAppTemplate(clientPhone, template);
            } catch (whatsappError) {
              console.error('[STRIPE-WEBHOOK] WhatsApp error:', whatsappError);
            }
          }

          if (booking.client_email) {
            try {
              const { data: bookingTreatmentsEmail } = await supabase
                .from('booking_treatments')
                .select('treatment_id, treatment_menus(name, price, price_on_request)')
                .eq('booking_id', booking.id);

              const treatmentsForEmail = (bookingTreatmentsEmail || []).map((bt: any) => ({
                name: bt.treatment_menus?.name,
                price: bt.treatment_menus?.price,
                isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
              }));

              await supabase.functions.invoke('send-booking-confirmation', {
                body: {
                  email: booking.client_email,
                  bookingId: booking.id,
                  bookingNumber: booking.booking_id.toString(),
                  clientName: `${booking.client_first_name} ${booking.client_last_name || ''}`.trim(),
                  hotelName: booking.hotel_name,
                  roomNumber: booking.room_number,
                  bookingDate: booking.booking_date,
                  bookingTime: booking.booking_time,
                  treatments: treatmentsForEmail,
                  totalPrice: booking.total_price,
                  currency: currency,
                  siteUrl: Deno.env.get("SITE_URL") || "https://lymfea.fr",
                },
              });
              console.log('[STRIPE-WEBHOOK] Confirmation email sent to client (Payment Link)');
            } catch (emailError) {
              console.error('[STRIPE-WEBHOOK] Payment Link Email error:', emailError);
            }
          }

          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        const bookingIdFromMeta = metadata?.booking_id;

        if (!bookingIdFromMeta) {
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        const { data: booking, error: bookingFetchError } = await supabase
          .from('bookings')
          .select('id, booking_id, hotel_id, client_email, client_first_name, client_last_name, payment_status, status, total_price, booking_date, booking_time, room_number')
          .eq('id', bookingIdFromMeta)
          .single();

        if (bookingFetchError || !booking) {
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        if (booking.payment_status === 'paid') {
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        if (booking.status === 'cancelled' || booking.status === 'Annulé') {
          const { data: reactivated, error: reactivateError } = await supabase.rpc('reactivate_prereservation', {
            _booking_id: booking.id,
          });

          if (reactivateError || !reactivated) {
            try {
              const paymentIntentId = session.payment_intent as string;
              if (paymentIntentId) {
                await stripe.refunds.create({ payment_intent: paymentIntentId });
              }
            } catch (refundError) {
              console.error('[STRIPE-WEBHOOK] Auto-refund failed:', refundError);
            }

            try {
              await supabase.functions.invoke('send-slack-notification', {
                body: {
                  type: 'auto_refund',
                  bookingId: booking.id,
                  bookingNumber: booking.booking_id.toString(),
                  clientName: `${booking.client_first_name} ${booking.client_last_name}`,
                  reason: 'Pre-reservation expired and slot taken by another client',
                }
              });
            } catch (slackError) {
              console.error('[STRIPE-WEBHOOK] Slack notification failed:', slackError);
            }

            return new Response(JSON.stringify({ received: true }), { status: 200 });
          }
        } else {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', booking.id);

          if (updateError) throw updateError;
        }

        const { data: hotel } = await supabase
          .from('hotels')
          .select('name, currency, hotel_commission, vat')
          .eq('id', booking.hotel_id)
          .maybeSingle();

        const { data: therapistRow } = booking.therapist_id
          ? await supabase
              .from('therapists')
              .select('rate_45, rate_60, rate_90')
              .eq('id', booking.therapist_id)
              .maybeSingle()
          : { data: null };

        // Get treatment details for email
        const { data: bookingTreatments } = await supabase
          .from('booking_treatments')
          .select('treatment_id, treatment_menus(name, price, price_on_request)')
          .eq('booking_id', booking.id);

        const treatmentsForEmail = (bookingTreatments || []).map((bt: any) => ({
          name: bt.treatment_menus?.name,
          price: bt.treatment_menus?.price,
          isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
        }));

        const currencyForEmail = (hotel?.currency || 'EUR').toUpperCase();

        try {
          const hotelCommissionPercent = hotel?.hotel_commission ?? 10;
          const totalPrice = booking.total_price || 0;
          const vatRate = hotel?.vat || 20;
          const totalHT = totalPrice / (1 + vatRate / 100);

          const bookingDuration = (bookingTreatments || []).reduce(
            (sum: number, bt: any) => sum + (bt.treatment_menus?.duration || 0),
            0,
          );
          const therapistEarned = computeTherapistEarnings(
            therapistRow
              ? {
                  rate_45: therapistRow.rate_45 ?? null,
                  rate_60: therapistRow.rate_60 ?? null,
                  rate_90: therapistRow.rate_90 ?? null,
                }
              : null,
            bookingDuration,
          ) ?? 0;

          const hotelAmount = (totalHT * hotelCommissionPercent) / 100;
          const oomAmount = Math.max(0, totalHT - hotelAmount - therapistEarned);

          console.log(`[STRIPE-WEBHOOK] Commission breakdown: Hotel ${hotelCommissionPercent}% (${hotelAmount}€), Therapist ${therapistEarned}€, OOM ${oomAmount}€`);

          const { error: oomLedgerError } = await supabase
            .from('hotel_ledger')
            .insert({
              hotel_id: booking.hotel_id,
              booking_id: booking.id,
              amount: oomAmount,
              status: 'pending',
              description: `Commission ${brand.name} - Réservation #${booking.booking_id}`,
            });

          if (oomLedgerError) {
            console.error('[STRIPE-WEBHOOK] OOM ledger entry failed:', oomLedgerError);
          }

          if (hotelAmount > 0) {
            await supabase.from('hotel_ledger').insert({
              hotel_id: booking.hotel_id,
              booking_id: booking.id,
              amount: -hotelAmount,
              status: 'pending',
              description: `Commission Hôtel à payer (${hotelCommissionPercent}%) - Réservation #${booking.booking_id}`,
            });
          }
        } catch (ledgerErr) {
          console.error('[STRIPE-WEBHOOK] Ledger entry error:', ledgerErr);
        }

        if (booking.client_email) {
          try {
            await supabase.functions.invoke('send-booking-confirmation', {
              body: {
                email: booking.client_email,
                bookingId: booking.id,
                bookingNumber: booking.booking_id.toString(),
                clientName: `${booking.client_first_name} ${booking.client_last_name}`,
                hotelName: hotel?.name,
                roomNumber: booking.room_number,
                bookingDate: booking.booking_date,
                bookingTime: booking.booking_time,
                treatments: treatmentsForEmail,
                totalPrice: booking.total_price,
                currency: currencyForEmail,
                siteUrl: metadata?.site_url || '',
              },
            });
          } catch (emailError) {
            console.error('[STRIPE-WEBHOOK] Email error:', emailError);
          }
        }

        try {
          await supabase.functions.invoke('notify-admin-new-booking', {
            body: { bookingId: booking.id }
          });
        } catch (adminError) {}

        try {
          await supabase.functions.invoke('trigger-new-booking-notifications', {
            body: { bookingId: booking.id }
          });
        } catch (pushError) {}
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceItems = await stripe.invoiceItems.list({ invoice: invoice.id });

      for (const item of invoiceItems.data) {
        const bookingId = item.metadata?.booking_id;
        if (!bookingId) continue;

        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            *,
            therapist:therapists(id, stripe_account_id, rate_45, rate_60, rate_90),
            hotel:hotels(vat),
            booking_treatments(treatment_menus(duration))
          `)
          .eq('id', bookingId)
          .single();

        if (bookingError || !booking) continue;

        if (!booking.therapist?.stripe_account_id) {
          await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
          continue;
        }

        // Calculate therapist share via shared util
        const bookingDur = (booking.booking_treatments || []).reduce(
          (sum: number, bt: any) => sum + (bt.treatment_menus?.duration || 0),
          0,
        );
        const earnedAmount = computeTherapistEarnings(
          booking.therapist
            ? {
                rate_45: booking.therapist.rate_45 ?? null,
                rate_60: booking.therapist.rate_60 ?? null,
                rate_90: booking.therapist.rate_90 ?? null,
              }
            : null,
          bookingDur,
        );
        if (earnedAmount == null) {
          console.error(`[STRIPE-WEBHOOK] Cannot compute therapist earnings for booking ${booking.booking_id}`);
          continue;
        }
        const therapistAmount = Math.round(earnedAmount);
        const oomCommission = (booking.total_price || 0) - therapistAmount;

        try {
          const transfer = await stripe.transfers.create({
            amount: therapistAmount * 100,
            currency: invoice.currency,
            destination: booking.therapist.stripe_account_id,
            description: `Paiement pour réservation #${booking.booking_id}`,
            metadata: { booking_id: booking.id, invoice_id: invoice.id },
          });

          await supabase.from('therapist_payouts').insert({
            therapist_id: booking.therapist.id,
            booking_id: booking.id,
            amount: therapistAmount,
            status: 'completed',
            stripe_transfer_id: transfer.id,
          });

          await supabase.from('hotel_ledger').insert({
            hotel_id: booking.hotel_id,
            booking_id: booking.id,
            amount: oomCommission,
            status: 'paid',
            description: `Paiement carte - Réservation #${booking.booking_id}`,
          });

          await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);

        } catch (transferError) {
          await supabase.from('therapist_payouts').insert({
            therapist_id: booking.therapist.id,
            booking_id: booking.id,
            amount: therapistAmount,
            status: 'failed',
            error_message: transferError instanceof Error ? transferError.message : String(transferError),
          });
        }
      }
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      let bookingId = session.metadata?.booking_id;

      if (!bookingId) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id')
          .eq('stripe_invoice_url', session.id)
          .maybeSingle();
        if (booking) bookingId = booking.id;
      }

      if (!bookingId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      let errorDetails = null;
      if (session.payment_intent) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
          errorDetails = paymentIntent.last_payment_error;
        } catch (err) {}
      }

      const { data: booking, error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'failed',
          payment_error_code: errorDetails?.code || 'unknown',
          payment_error_message: errorDetails?.message || 'Payment failed',
          payment_error_details: JSON.stringify({
            decline_code: errorDetails?.decline_code,
            network_decline_code: errorDetails?.network_decline_code,
            last4: errorDetails?.payment_method?.card?.last4,
            brand: errorDetails?.payment_method?.card?.brand,
            timestamp: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .select('id, booking_id, client_first_name, client_last_name, hotel_name, total_price, booking_date, booking_time')
        .single();

      if (updateError) throw updateError;

      try {
        await supabase.functions.invoke('send-slack-notification', {
          body: {
            type: 'payment_failed',
            bookingId: booking.id,
            bookingNumber: booking.booking_id.toString(),
            clientName: `${booking.client_first_name} ${booking.client_last_name}`,
            hotelName: booking.hotel_name,
            bookingDate: booking.booking_date,
            bookingTime: booking.booking_time,
            totalPrice: booking.total_price,
            paymentErrorCode: errorDetails?.code || 'unknown',
            paymentErrorMessage: errorDetails?.message || 'Payment failed',
            paymentDeclineCode: errorDetails?.decline_code,
            cardBrand: errorDetails?.payment_method?.card?.brand,
            cardLast4: errorDetails?.payment_method?.card?.last4,
          }
        });
      } catch (notifyError) {}

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      let bookingId = paymentIntent.metadata?.booking_id;

      if (!bookingId) {
        try {
          const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 1 });
          if (sessions.data.length > 0) bookingId = sessions.data[0].metadata?.booking_id;
        } catch (lookupError) {}
      }

      if (!bookingId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('payment_status, id, booking_id, client_first_name, client_last_name, hotel_name, total_price, booking_date, booking_time')
        .eq('id', bookingId)
        .single();

      if (existingBooking?.payment_status === 'failed' || !existingBooking) {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const errorDetails = paymentIntent.last_payment_error;

      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'failed',
          payment_error_code: errorDetails?.code || 'unknown',
          payment_error_message: errorDetails?.message || 'Payment failed',
          payment_error_details: JSON.stringify({
            decline_code: errorDetails?.decline_code,
            network_decline_code: errorDetails?.network_decline_code,
            last4: errorDetails?.payment_method?.card?.last4,
            brand: errorDetails?.payment_method?.card?.brand,
            timestamp: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (updateError) throw updateError;

      try {
        await supabase.functions.invoke('send-slack-notification', {
          body: {
            type: 'payment_failed',
            bookingId: existingBooking.id,
            bookingNumber: existingBooking.booking_id.toString(),
            clientName: `${existingBooking.client_first_name} ${existingBooking.client_last_name}`,
            hotelName: existingBooking.hotel_name,
            bookingDate: existingBooking.booking_date,
            bookingTime: existingBooking.booking_time,
            totalPrice: existingBooking.total_price,
            paymentErrorCode: errorDetails?.code || 'unknown',
            paymentErrorMessage: errorDetails?.message || 'Payment failed',
            paymentDeclineCode: errorDetails?.decline_code,
            cardBrand: errorDetails?.payment_method?.card?.brand,
            cardLast4: errorDetails?.payment_method?.card?.last4,
          }
        });
      } catch (notifyError) {}

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
  }
});