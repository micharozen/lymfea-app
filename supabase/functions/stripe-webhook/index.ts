import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  sendWhatsAppTemplate,
  buildPaymentConfirmedTemplateMessage,
  formatDateForWhatsApp,
} from '../_shared/whatsapp-meta.ts';

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

        if (!metadata?.hotel_id) {
          console.error("[STRIPE-WEBHOOK] Missing hotel_id in metadata");
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Check if booking already exists for this session
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('stripe_invoice_url', session.id)
          .maybeSingle();

        if (existingBooking) {
          console.log(`[STRIPE-WEBHOOK] Booking already exists for session ${session.id}`);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        // Fetch hotel info with both commissions
        const { data: hotel } = await supabase
          .from('hotels')
          .select('name, currency, hairdresser_commission, hotel_commission')
          .eq('id', metadata.hotel_id)
          .maybeSingle();

        // Parse treatment IDs from metadata
        let treatmentIds: string[] = [];
        try {
          treatmentIds = JSON.parse(metadata.treatment_ids || '[]');
        } catch (e) {
          console.error("[STRIPE-WEBHOOK] Failed to parse treatment_ids:", e);
        }

        // Create the booking
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .insert({
            hotel_id: metadata.hotel_id,
            hotel_name: hotel?.name || null,
            client_first_name: metadata.client_first_name || '',
            client_last_name: metadata.client_last_name || '',
            client_email: metadata.client_email || null,
            phone: metadata.client_phone || '',
            room_number: metadata.room_number || null,
            client_note: metadata.client_note || null,
            booking_date: metadata.booking_date,
            booking_time: metadata.booking_time,
            status: 'pending',
            payment_method: 'card',
            payment_status: 'paid',
            total_price: parseFloat(metadata.verified_total_price || '0'),
            stripe_invoice_url: session.id, // Store session ID to prevent duplicates
          })
          .select()
          .single();

        if (bookingError) {
          console.error("[STRIPE-WEBHOOK] Booking creation error:", bookingError);
          throw bookingError;
        }

        console.log(`[STRIPE-WEBHOOK] Booking created: #${booking.booking_id} (${booking.id})`);

        // Add booking treatments
        if (treatmentIds.length > 0) {
          for (const treatmentId of treatmentIds) {
            const { error: treatmentError } = await supabase
              .from('booking_treatments')
              .insert({
                booking_id: booking.id,
                treatment_id: treatmentId,
              });

            if (treatmentError) {
              console.error("[STRIPE-WEBHOOK] Treatment insert error:", treatmentError);
            }
          }
          console.log(`[STRIPE-WEBHOOK] Added ${treatmentIds.length} treatments to booking`);
        }

        // Get treatment details for email
        const { data: treatmentDetails } = await supabase
          .from('treatment_menus')
          .select('name, price, price_on_request')
          .in('id', treatmentIds);

        const treatmentsForEmail = (treatmentDetails || []).map((t) => ({
          name: t.name,
          price: t.price,
          isPriceOnRequest: !!t.price_on_request,
        }));

        const currencyForEmail = (hotel?.currency || 'EUR').toUpperCase();

        // Create ledger entries so Finance shows all transactions
        // For card payments: OOM receives full amount, then owes hotel their commission
        try {
          const hairdresserCommissionPercent = hotel?.hairdresser_commission ?? 70;
          const hotelCommissionPercent = hotel?.hotel_commission ?? 10;
          const oomCommissionPercent = Math.max(0, 100 - hairdresserCommissionPercent - hotelCommissionPercent);
          const totalPrice = parseFloat(metadata.verified_total_price || '0');
          
          const oomAmount = (totalPrice * oomCommissionPercent) / 100;
          const hotelAmount = (totalPrice * hotelCommissionPercent) / 100;
          const hairdresserAmount = (totalPrice * hairdresserCommissionPercent) / 100;

          console.log(`[STRIPE-WEBHOOK] Commission breakdown: Hotel ${hotelCommissionPercent}% (${hotelAmount}€), Hairdresser ${hairdresserCommissionPercent}% (${hairdresserAmount}€), OOM ${oomCommissionPercent}% (${oomAmount}€)`);
          console.log(`[STRIPE-WEBHOOK] Total: ${totalPrice}€`);

          // Entry 1: OOM commission (what OOM keeps)
          const { error: oomLedgerError } = await supabase
            .from('hotel_ledger')
            .insert({
              hotel_id: booking.hotel_id,
              booking_id: booking.id,
              amount: oomAmount,
              status: 'pending',
              description: `Commission OOM (${oomCommissionPercent}%) - Réservation #${booking.booking_id}`,
            });

          if (oomLedgerError) {
            console.error('[STRIPE-WEBHOOK] OOM ledger entry failed:', oomLedgerError);
          } else {
            console.log(`[STRIPE-WEBHOOK] OOM commission entry created: ${oomAmount}€`);
          }

          // Entry 2: Hotel commission (what OOM owes to hotel) - negative amount means OOM owes hotel
          if (hotelAmount > 0) {
            const { error: hotelLedgerError } = await supabase
              .from('hotel_ledger')
              .insert({
                hotel_id: booking.hotel_id,
                booking_id: booking.id,
                amount: -hotelAmount, // Negative = OOM owes hotel
                status: 'pending',
                description: `Commission Hôtel à payer (${hotelCommissionPercent}%) - Réservation #${booking.booking_id}`,
              });

            if (hotelLedgerError) {
              console.error('[STRIPE-WEBHOOK] Hotel commission ledger entry failed:', hotelLedgerError);
            } else {
              console.log(`[STRIPE-WEBHOOK] Hotel commission entry created: -${hotelAmount}€ (OOM owes hotel)`);
            }
          }

          console.log(`[STRIPE-WEBHOOK] Ledger entries created for booking #${booking.booking_id}`);
        } catch (ledgerErr) {
          console.error('[STRIPE-WEBHOOK] Ledger entry error:', ledgerErr);
        }

        // Send confirmation email to client
        if (metadata.client_email) {
          try {
            await supabase.functions.invoke('send-booking-confirmation', {
              body: {
                email: metadata.client_email,
                bookingId: booking.id,
                bookingNumber: booking.booking_id.toString(),
                clientName: `${metadata.client_first_name} ${metadata.client_last_name}`,
                hotelName: hotel?.name,
                roomNumber: metadata.room_number,
                bookingDate: metadata.booking_date,
                bookingTime: metadata.booking_time,
                treatments: treatmentsForEmail,
                totalPrice: parseFloat(metadata.verified_total_price || '0'),
                currency: currencyForEmail,
                siteUrl: metadata.site_url || '',
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

        // Trigger push notifications to hairdressers
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

        // Fetch booking with hairdresser and hotel info
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            *,
            hairdresser:hairdressers(id, stripe_account_id),
            hotel:hotels(hairdresser_commission)
          `)
          .eq('id', bookingId)
          .single();

        if (bookingError || !booking) {
          console.error(`[STRIPE-WEBHOOK] Booking not found: ${bookingId}`);
          continue;
        }

        console.log(`[STRIPE-WEBHOOK] Processing booking ${booking.booking_id}`);

        // Check hairdresser has Stripe Connect
        if (!booking.hairdresser?.stripe_account_id) {
          console.log(`[STRIPE-WEBHOOK] Hairdresser has no Stripe Connect account for booking ${booking.booking_id}`);
          // Still update payment status
          await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', bookingId);
          continue;
        }

        // Calculate hairdresser share
        const hairdresserCommission = booking.hotel?.hairdresser_commission || 70;
        const hairdresserAmount = Math.round((booking.total_price * hairdresserCommission) / 100);
        const oomCommission = booking.total_price - hairdresserAmount;

        try {
          // Transfer to hairdresser via Stripe Connect
          const transfer = await stripe.transfers.create({
            amount: hairdresserAmount * 100, // Stripe uses cents
            currency: invoice.currency,
            destination: booking.hairdresser.stripe_account_id,
            description: `Paiement pour réservation #${booking.booking_id}`,
            metadata: {
              booking_id: booking.id,
              invoice_id: invoice.id,
            },
          });

          console.log(`[STRIPE-WEBHOOK] Transfer created: ${transfer.id} - ${hairdresserAmount}€`);

          // Record payout
          await supabase
            .from('hairdresser_payouts')
            .insert({
              hairdresser_id: booking.hairdresser.id,
              booking_id: booking.id,
              amount: hairdresserAmount,
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
            .from('hairdresser_payouts')
            .insert({
              hairdresser_id: booking.hairdresser.id,
              booking_id: booking.id,
              amount: hairdresserAmount,
              status: 'failed',
              error_message: transferError instanceof Error ? transferError.message : String(transferError),
            });
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
