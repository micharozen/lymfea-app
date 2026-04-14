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

    // Handle checkout.session.completed - Create booking after payment
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.mode === "payment" && session.payment_status === "paid") {
        console.log(`[STRIPE-WEBHOOK] Processing paid checkout session: ${session.id}`);
        
        const metadata = session.metadata;

        // Handle payment link completions - update existing booking
        if (metadata?.source === 'payment_link' && metadata?.booking_id) {
          console.log(`[STRIPE-WEBHOOK] Payment link completed for booking: ${metadata.booking_id}`);

          // Fetch full booking details for WhatsApp confirmation
          const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select(`
              id,
              booking_id,
              client_first_name,
              phone,
              room_number,
              booking_date,
              booking_time,
              total_price,
              hotel_id,
              hotel_name,
              payment_link_language,
              payment_link_channels
            `)
            .eq('id', metadata.booking_id)
            .single();

          if (fetchError || !booking) {
            console.error('[STRIPE-WEBHOOK] Failed to fetch booking:', fetchError);
            throw new Error(`Booking not found: ${metadata.booking_id}`);
          }

          // Update payment status
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'paid',
              stripe_invoice_url: session.id
            })
            .eq('id', metadata.booking_id);

          if (updateError) {
            console.error('[STRIPE-WEBHOOK] Failed to update booking payment status:', updateError);
            throw updateError;
          }

          console.log(`[STRIPE-WEBHOOK] Booking ${metadata.booking_id} marked as paid via payment link`);

          // Send WhatsApp payment confirmation if payment link was sent via WhatsApp
          const wasWhatsAppUsed = booking.payment_link_channels?.includes('whatsapp');
          const clientPhone = booking.phone;

          if (wasWhatsAppUsed && clientPhone) {
            try {
              // Fetch hotel currency
              let currency = 'EUR';
              if (booking.hotel_id) {
                const { data: hotel } = await supabase
                  .from('hotels')
                  .select('currency')
                  .eq('id', booking.hotel_id)
                  .single();
                if (hotel?.currency) {
                  currency = hotel.currency.toUpperCase();
                }
              }

              // Fetch treatments for this booking
              const { data: bookingTreatments } = await supabase
                .from('booking_treatments')
                .select(`
                  treatment_menus (name)
                `)
                .eq('booking_id', booking.id);

              const treatmentsList = bookingTreatments
                ?.map(bt => bt.treatment_menus?.name)
                .filter(Boolean)
                .join(', ') || 'Service bien-être';

              // Determine language (default to 'fr' if not set)
              const language = (booking.payment_link_language as 'fr' | 'en') || 'fr';

              // Format date
              const formattedDate = formatDateForWhatsApp(booking.booking_date);

              // Format amount with currency symbol
              const currencySymbol = currency === 'EUR' ? '€' : currency;
              const amountPaid = `${booking.total_price}${currencySymbol}`;

              // Build and send WhatsApp template
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

              const whatsappResult = await sendWhatsAppTemplate(clientPhone, template);

              if (whatsappResult.success) {
                console.log(`[STRIPE-WEBHOOK] WhatsApp payment confirmation sent: ${whatsappResult.messageId}`);
              } else {
                console.error(`[STRIPE-WEBHOOK] WhatsApp payment confirmation failed: ${whatsappResult.error}`);
              }
            } catch (whatsappError) {
              console.error('[STRIPE-WEBHOOK] WhatsApp payment confirmation error:', whatsappError);
              // Don't throw - payment is already processed, WhatsApp is best-effort
            }
          }

          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // PRE-RESERVATION FLOW: Find the pre-reserved booking created by create-checkout-session
        const bookingIdFromMeta = metadata?.booking_id;

        if (!bookingIdFromMeta) {
          console.error("[STRIPE-WEBHOOK] Missing booking_id in metadata (legacy flow?)");
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Fetch the pre-reserved booking
        const { data: booking, error: bookingFetchError } = await supabase
          .from('bookings')
          .select('id, booking_id, hotel_id, client_email, client_first_name, client_last_name, payment_status, status, total_price, booking_date, booking_time, room_number')
          .eq('id', bookingIdFromMeta)
          .single();

        if (bookingFetchError || !booking) {
          console.error("[STRIPE-WEBHOOK] Pre-reserved booking not found:", bookingIdFromMeta, bookingFetchError);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Idempotency guard: skip if already paid (Stripe retry protection)
        if (booking.payment_status === 'paid') {
          console.log(`[STRIPE-WEBHOOK] Booking ${booking.booking_id} already paid, skipping`);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Handle expired pre-reservation: if cron cancelled it before payment arrived
        if (booking.status === 'cancelled' || booking.status === 'Annulé') {
          console.log(`[STRIPE-WEBHOOK] Pre-reservation expired, attempting reactivation for booking ${booking.id}`);

          const { data: reactivated, error: reactivateError } = await supabase.rpc('reactivate_prereservation', {
            _booking_id: booking.id,
          });

          if (reactivateError || !reactivated) {
            // Slot was taken by someone else — auto-refund the client
            console.error(`[STRIPE-WEBHOOK] Reactivation failed for booking ${booking.id}, auto-refunding`);

            try {
              const paymentIntentId = session.payment_intent as string;
              if (paymentIntentId) {
                await stripe.refunds.create({ payment_intent: paymentIntentId });
                console.log(`[STRIPE-WEBHOOK] Auto-refund issued for payment intent: ${paymentIntentId}`);
              }
            } catch (refundError) {
              console.error('[STRIPE-WEBHOOK] Auto-refund failed:', refundError);
            }

            // Notify admin via Slack about the auto-refund
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

          console.log(`[STRIPE-WEBHOOK] Pre-reservation reactivated successfully for booking ${booking.id}`);
          // Continue with normal payment confirmation flow
        } else {
          // Normal case: booking still active (awaiting_payment), update to paid
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', booking.id);

          if (updateError) {
            console.error('[STRIPE-WEBHOOK] Failed to update payment status:', updateError);
            throw updateError;
          }
        }

        console.log(`[STRIPE-WEBHOOK] Booking ${booking.booking_id} confirmed as paid`);

        // Fetch hotel info for commissions and email
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

        // Create ledger entries so Finance shows all transactions
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
            const { error: hotelLedgerError } = await supabase
              .from('hotel_ledger')
              .insert({
                hotel_id: booking.hotel_id,
                booking_id: booking.id,
                amount: -hotelAmount,
                status: 'pending',
                description: `Commission Hôtel à payer (${hotelCommissionPercent}%) - Réservation #${booking.booking_id}`,
              });

            if (hotelLedgerError) {
              console.error('[STRIPE-WEBHOOK] Hotel commission ledger entry failed:', hotelLedgerError);
            }
          }
        } catch (ledgerErr) {
          console.error('[STRIPE-WEBHOOK] Ledger entry error:', ledgerErr);
        }

        // Send confirmation email to client
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
            console.log('[STRIPE-WEBHOOK] Confirmation email sent to client');
          } catch (emailError) {
            console.error('[STRIPE-WEBHOOK] Email error:', emailError);
          }
        }

        // Notify admins
        try {
          await supabase.functions.invoke('notify-admin-new-booking', {
            body: { bookingId: booking.id }
          });
          console.log("[STRIPE-WEBHOOK] Admin notification sent");
        } catch (adminError) {
          console.error("[STRIPE-WEBHOOK] Admin notification error:", adminError);
        }

        // Trigger push notifications to therapists
        try {
          await supabase.functions.invoke('trigger-new-booking-notifications', {
            body: { bookingId: booking.id }
          });
          console.log("[STRIPE-WEBHOOK] Push notifications triggered");
        } catch (pushError) {
          console.error("[STRIPE-WEBHOOK] Push notification error:", pushError);
        }
      }
    }

    // Handle invoice.payment_succeeded - For subscription or invoice payments
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      
      console.log(`[STRIPE-WEBHOOK] Invoice paid: ${invoice.id}`);

      // Get invoice items to find bookings
      const invoiceItems = await stripe.invoiceItems.list({
        invoice: invoice.id,
      });

      console.log(`[STRIPE-WEBHOOK] Processing ${invoiceItems.data.length} items`);

      for (const item of invoiceItems.data) {
        const bookingId = item.metadata?.booking_id;
        
        if (!bookingId) continue;

        // Fetch booking with therapist and hotel info
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

        if (bookingError || !booking) {
          console.error(`[STRIPE-WEBHOOK] Booking not found: ${bookingId}`);
          continue;
        }

        console.log(`[STRIPE-WEBHOOK] Processing booking ${booking.booking_id}`);

        // Check therapist has Stripe Connect
        if (!booking.therapist?.stripe_account_id) {
          console.log(`[STRIPE-WEBHOOK] Therapist has no Stripe Connect account for booking ${booking.booking_id}`);
          // Still update payment status
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', bookingId);
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
          // Transfer to therapist via Stripe Connect
          const transfer = await stripe.transfers.create({
            amount: therapistAmount * 100, // Stripe uses cents
            currency: invoice.currency,
            destination: booking.therapist.stripe_account_id,
            description: `Paiement pour réservation #${booking.booking_id}`,
            metadata: {
              booking_id: booking.id,
              invoice_id: invoice.id,
            },
          });

          console.log(`[STRIPE-WEBHOOK] Transfer created: ${transfer.id} - ${therapistAmount}€`);

          // Record payout
          await supabase
            .from('therapist_payouts')
            .insert({
              therapist_id: booking.therapist.id,
              booking_id: booking.id,
              amount: therapistAmount,
              status: 'completed',
              stripe_transfer_id: transfer.id,
            });

          // Create ledger entry for OOM commission
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

          // Update booking payment status
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', bookingId);

        } catch (transferError) {
          console.error(`[STRIPE-WEBHOOK] Transfer failed for booking ${booking.booking_id}:`, transferError);
          
          // Record failed payout
          await supabase
            .from('therapist_payouts')
            .insert({
              therapist_id: booking.therapist.id,
              booking_id: booking.id,
              amount: therapistAmount,
              status: 'failed',
              error_message: transferError instanceof Error ? transferError.message : String(transferError),
            });
        }
      }
    }

    // Handle checkout.session.async_payment_failed - Payment failed
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log(`[STRIPE-WEBHOOK] Payment failed for session: ${session.id}`);

      // 1. Find booking via metadata.booking_id or stripe_invoice_url
      let bookingId = session.metadata?.booking_id;

      if (!bookingId) {
        // Fallback: search via stripe_invoice_url
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, booking_id, client_first_name, client_last_name, hotel_name, booking_date, booking_time')
          .eq('stripe_invoice_url', session.id)
          .maybeSingle();

        if (booking) {
          bookingId = booking.id;
        }
      }

      if (!bookingId) {
        console.error('[STRIPE-WEBHOOK] Cannot find booking for failed payment');
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // 2. Retrieve payment intent error details
      let errorDetails = null;
      if (session.payment_intent) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            session.payment_intent as string
          );
          errorDetails = paymentIntent.last_payment_error;
        } catch (err) {
          console.error('[STRIPE-WEBHOOK] Failed to retrieve payment intent:', err);
        }
      }

      // 3. Update booking with failed status and error details
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

      if (updateError) {
        console.error('[STRIPE-WEBHOOK] Failed to update booking:', updateError);
        throw updateError;
      }

      console.log(`[STRIPE-WEBHOOK] Booking ${booking.booking_id} marked as payment failed`);

      // 4. Notify admin via Slack
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
        console.log('[STRIPE-WEBHOOK] Slack notification sent for payment failure');
      } catch (notifyError) {
        console.error('[STRIPE-WEBHOOK] Failed to send Slack notification:', notifyError);
        // Don't throw - payment status is already updated
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Handle payment_intent.payment_failed - Backup handler
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.log(`[STRIPE-WEBHOOK] Payment intent failed: ${paymentIntent.id}`);

      // Find booking via metadata
      let bookingId = paymentIntent.metadata?.booking_id;

      // Fallback: lookup via Checkout Session (Payment Link metadata propagates to session)
      if (!bookingId) {
        console.log('[STRIPE-WEBHOOK] No booking_id in payment intent metadata, looking up checkout session...');
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntent.id,
            limit: 1,
          });
          if (sessions.data.length > 0) {
            bookingId = sessions.data[0].metadata?.booking_id;
            console.log(`[STRIPE-WEBHOOK] Found booking_id from checkout session: ${bookingId}`);
          }
        } catch (lookupError) {
          console.error('[STRIPE-WEBHOOK] Failed to lookup checkout session:', lookupError);
        }
      }

      if (!bookingId) {
        console.log('[STRIPE-WEBHOOK] No booking_id found in payment intent or checkout session metadata, skipping');
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Check if booking is already marked as failed (avoid duplicates)
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('payment_status, id, booking_id, client_first_name, client_last_name, hotel_name, total_price, booking_date, booking_time')
        .eq('id', bookingId)
        .single();

      if (existingBooking?.payment_status === 'failed') {
        console.log('[STRIPE-WEBHOOK] Booking already marked as failed');
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      if (!existingBooking) {
        console.error('[STRIPE-WEBHOOK] Booking not found');
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Update booking with failed status
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

      if (updateError) {
        console.error('[STRIPE-WEBHOOK] Failed to update booking:', updateError);
        throw updateError;
      }

      console.log(`[STRIPE-WEBHOOK] Booking ${existingBooking.booking_id} marked as payment failed (payment_intent))`);

      // Notify admin via Slack
      try {
        const { data: slackData, error: slackError } = await supabase.functions.invoke('send-slack-notification', {
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
        if (slackError) {
          console.error('[STRIPE-WEBHOOK] Slack invoke error:', slackError);
        } else {
          console.log('[STRIPE-WEBHOOK] Slack notification sent for payment failure', slackData);
        }
      } catch (notifyError) {
        console.error('[STRIPE-WEBHOOK] Failed to send Slack notification:', notifyError);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
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
