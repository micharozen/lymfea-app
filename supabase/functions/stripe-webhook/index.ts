import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  sendWhatsAppTemplate,
  buildPaymentConfirmedTemplateMessage,
  formatDateForWhatsApp,
} from '../_shared/whatsapp-meta.ts';
import { brand, transactionalFrom } from "../_shared/brand.ts";
import {
  buildTherapistPayoutLegs,
  fetchPaidTherapistIds,
  fetchPayoutTherapists,
} from "../_shared/therapistPayouts.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";
import { getStripeForVenue, getGlobalStripe } from "../_shared/stripe-resolver.ts";
import { createLogger } from "../_shared/logger.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { buildPendingVars, buildConfirmedVars } from "../_shared/booking-email-vars.ts";
import { getBookingConfirmedHtml } from "../_shared/templates/booking-confirmed.ts";
import { getBookingPendingHtml } from "../_shared/templates/booking-pending.ts";
import { buildBookingIcs } from "../_shared/ics.ts";

/** UTF-8-safe base64 (btoa alone breaks on accented chars in the .ics). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const log = createLogger({ function: "stripe-webhook", req });

  if (!signature) {
    log.warn("webhook.missing_signature");
    await log.flush();
    return new Response("No signature", { status: 400 });
  }

  // Per-venue webhook routing: each venue configures their endpoint URL with
  // ?hotel_id=<uuid> in their Stripe Dashboard. We resolve the matching key +
  // webhook secret from Vault. Bookings made on the platform's global Stripe
  // account fall back to STRIPE_WEBHOOK_SECRET (legacy).
  const url = new URL(req.url);
  const hotelIdParam = url.searchParams.get("hotel_id");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let stripe: Stripe;
  let webhookSecret: string | null;
  if (hotelIdParam) {
    const resolved = await getStripeForVenue(supabase, hotelIdParam);
    stripe = resolved.client;
    webhookSecret = resolved.webhookSecret ?? Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null;
  } else {
    stripe = getGlobalStripe().client;
    webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null;
  }

  if (!webhookSecret) {
    console.error(`[STRIPE-WEBHOOK] No webhook secret for hotel_id=${hotelIdParam ?? "<none>"}`);
    log.error("webhook.missing_secret", null, { hotelId: hotelIdParam });
    await log.flush();
    return new Response("Webhook secret not configured", { status: 400 });
  }

  try {
    const body = await req.text();

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    log.bind({ event_type: event.type, hotelId: hotelIdParam });
    console.log(`[STRIPE-WEBHOOK] Event: ${event.type} (hotel=${hotelIdParam ?? "global"})`);

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
              surcharge_amount,
              is_out_of_hours,
              guest_count,
              therapist_id,
              status,
              hotel_id,
              hotel_name,
              therapist_name,
              payment_status,
              payment_link_language,
              payment_link_channels,
              customer_id,
              hotels(name, currency, image, contact_email, address, postal_code, city, country, timezone, website_url, cancellation_policy_text_en, cancellation_policy_text_fr, organizations(name))
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
              payment_status: 'paid',
              payment_method: 'card',
              stripe_invoice_url: session.id
            })
            .eq('id', metadata.booking_id);

          if (updateError) throw updateError;

          console.log(`[STRIPE-WEBHOOK] Booking ${metadata.booking_id} marked as paid via payment link`);

          const { error: paymentInfoError } = await supabase
            .from('booking_payment_infos')
            .update({
              payment_status: 'charged',
              payment_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id: (session.payment_intent as string) ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('booking_id', metadata.booking_id);
          if (paymentInfoError) {
            console.error('[STRIPE-WEBHOOK] booking_payment_infos update failed:', paymentInfoError);
          } else {
            console.log('[STRIPE-WEBHOOK] booking_payment_infos updated for booking:', metadata.booking_id);
          }

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
          
          // Venue fields resolved from the embed on the booking fetch above.
          const venue = (booking as any).hotels as {
            name?: string | null;
            currency?: string | null;
            image?: string | null;
            contact_email?: string | null;
            address?: string | null;
            postal_code?: string | null;
            city?: string | null;
            country?: string | null;
            timezone?: string | null;
            website_url?: string | null;
            organizations?: { name?: string | null } | null;
          } | null;
          const currency = (venue?.currency || 'EUR').toUpperCase();
          const venueContactEmail = venue?.contact_email || brand.legal.contactEmail;
          const venueOrganizationName = venue?.organizations?.name || brand.name;

          const { data: bookingTreatments } = await supabase
            .from('booking_treatments')
            .select('price_override, treatment_menus (name, price, duration, amenity_id), treatment_variants (label, price, duration)')
            .eq('booking_id', booking.id);

          const treatmentRows = (bookingTreatments ?? []).map(bt => {
            const menu = bt.treatment_menus as any;
            const variant = bt.treatment_variants as any;
            return {
              name: (menu?.name || '') + (variant?.label ? ` · ${variant.label}` : ''),
              price: resolveTreatmentPrice(bt as any),
              duration: Number(variant?.duration ?? menu?.duration) || 0,
              is_amenity: !!menu?.amenity_id,
            };
          });
          const treatmentsList = treatmentRows.map(t => t.name).filter(Boolean).join(', ') || 'Service bien-être';

          // Civilité (fiche customer) → salutation personnalisée dans les emails.
          let customerCivility: string | null = null;
          if ((booking as any).customer_id) {
            const { data: customerRow } = await supabase
              .from('customers')
              .select('civility')
              .eq('id', (booking as any).customer_id)
              .maybeSingle();
            customerCivility = (customerRow as any)?.civility ?? null;
          }

          // Langue + contexte partagé pour les deux templates client ci-dessous.
          // Le builder centralise civilité, nom, dates, prix, durée, devise et
          // logo du lieu.
          const clientLanguage: 'fr' | 'en' = booking.payment_link_language === 'en' ? 'en' : 'fr';
          const siteUrl = Deno.env.get('SITE_URL') || `https://${brand.appDomain}`;
          const emailCtx = {
            booking: {
              booking_id: booking.booking_id,
              client_first_name: booking.client_first_name,
              client_last_name: booking.client_last_name,
              phone: booking.phone,
              room_number: booking.room_number,
              therapist_name: (booking as any).therapist_name,
              total_price: booking.total_price,
              surcharge_amount: (booking as any).surcharge_amount,
              is_out_of_hours: (booking as any).is_out_of_hours,
              hotel_name: booking.hotel_name,
              booking_date: booking.booking_date,
              booking_time: booking.booking_time,
            },
            venue,
            civility: customerCivility,
            lang: clientLanguage,
            treatments: treatmentRows,
            bookingUrl: `${siteUrl}/booking/manage/${booking.id}`,
            contactEmail: venueContactEmail,
            organizationName: venueOrganizationName,
          };

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

          // The booking is now paid but a therapist may not be assigned yet, so
          // we send the PENDING template (payment received, awaiting therapist).
          // If the booking is already confirmed at payment time, it means a
          // therapist was assigned at creation but the confirmation email was held
          // back (unpaid) — send BOOKING_CONFIRMED now that payment has landed.
          if (booking.client_email && booking.status === 'pending') {
            try {
              const emailResult = await sendEmail({
                to: booking.client_email,
                subject: clientLanguage === 'en'
                  ? `Booking request #${booking.booking_id} · ${booking.hotel_name ?? ''}`
                  : `Demande de réservation #${booking.booking_id} · ${booking.hotel_name ?? ''}`,
                from: transactionalFrom(clientLanguage),
                html: getBookingPendingHtml(clientLanguage, buildPendingVars(emailCtx)),
                audit: { bookingId: booking.id, emailType: 'new_booking_notifications', metadata: { booking_number: booking.booking_id } },
              });

              if (emailResult.error) {
                console.error('[STRIPE-WEBHOOK] Payment Link pending email error:', emailResult.error);
              } else {
                console.log('[STRIPE-WEBHOOK] Pending booking email sent to client (Payment Link)');
              }
            } catch (emailError) {
              console.error('[STRIPE-WEBHOOK] Payment Link Email error:', emailError);
            }
          } else if (booking.client_email && booking.status === 'confirmed') {
            // Confirmed-at-creation booking whose confirmation email was held back
            // because payment wasn't engaged. Payment has now landed → send it.
            try {
              const icsResult = buildBookingIcs({
                id: booking.id,
                booking_id: booking.booking_id,
                booking_date: booking.booking_date,
                booking_time: booking.booking_time,
                venue_name: venue?.name || booking.hotel_name,
                timezone: venue?.timezone,
                address: venue?.address,
                postal_code: venue?.postal_code,
                city: venue?.city,
                country: venue?.country,
                treatments: treatmentRows,
              });
              const emailResult = await sendEmail({
                to: booking.client_email,
                subject: clientLanguage === 'en'
                  ? `✅ Your treatment is confirmed · ${booking.hotel_name ?? ''}`
                  : `✅ Votre soin est confirmé · ${booking.hotel_name ?? ''}`,
                from: transactionalFrom(clientLanguage),
                html: getBookingConfirmedHtml(clientLanguage, buildConfirmedVars(emailCtx)),
                attachments: icsResult
                  ? [{ filename: icsResult.filename, content: toBase64Utf8(icsResult.ics), contentType: "text/calendar" }]
                  : undefined,
                audit: { bookingId: booking.id, emailType: 'booking_confirmed', metadata: { booking_number: booking.booking_id } },
              });

              if (emailResult.error) {
                console.error('[STRIPE-WEBHOOK] Payment Link confirmed email error:', emailResult.error);
              } else {
                console.log('[STRIPE-WEBHOOK] Confirmed booking email sent to client (Payment Link)');
              }
            } catch (emailError) {
              console.error('[STRIPE-WEBHOOK] Payment Link confirmed email exception:', emailError);
            }
          } else if (booking.client_email) {
            console.log('[STRIPE-WEBHOOK] Booking status not pending/confirmed — skipping payment email:', booking.status);
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
          .select('name, currency, hotel_commission, vat, out_of_hours_surcharge_percent')
          .eq('id', booking.hotel_id)
          .maybeSingle();

        // Get treatment details for email
        const { data: bookingTreatments } = await supabase
          .from('booking_treatments')
          .select('treatment_id, therapist_id, is_addon, price_override, treatment_menus(name, price, price_on_request, duration), treatment_variants(price, duration)')
          .eq('booking_id', booking.id);

        const treatmentsForEmail = (bookingTreatments || []).map((bt: any) => ({
          name: bt.treatment_menus?.name,
          price: resolveTreatmentPrice(bt),
          isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
        }));

        const currencyForEmail = (hotel?.currency || 'EUR').toUpperCase();

        try {
          const hotelCommissionPercent = hotel?.hotel_commission ?? 10;
          const totalPrice = booking.total_price || 0;
          const vatRate = hotel?.vat || 20;
          const totalHT = totalPrice / (1 + vatRate / 100);
          const hotelAmount = (totalHT * hotelCommissionPercent) / 100;

          // Aggregate therapist earnings (duo → all accepted therapists, each on
          // their own soin; solo → the single therapist), with out-of-hours
          // surcharge, capped at totalHT − hotelAmount.
          const payoutTherapists = await fetchPayoutTherapists(supabase, booking.id, (booking as any).therapist_id);
          const payoutTreatments = (bookingTreatments || []).map((bt: any) => ({
            duration: Number(bt.treatment_variants?.duration ?? bt.treatment_menus?.duration) || 0,
            therapist_id: bt.therapist_id ?? null,
            is_addon: bt.is_addon ?? false,
          }));
          const { totalAmount: therapistEarned } = buildTherapistPayoutLegs({
            therapists: payoutTherapists,
            treatments: payoutTreatments,
            guestCount: (booking as any).guest_count ?? 1,
            isOutOfHours: !!(booking as any).is_out_of_hours,
            surchargePercent: Number((hotel as any)?.out_of_hours_surcharge_percent ?? 0) || 0,
            capTotal: totalHT - hotelAmount,
          });

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
            therapist:therapists(id, stripe_account_id, rate_60, rate_75, rate_90),
            hotel:hotels(vat, hotel_commission, out_of_hours_surcharge_percent),
            booking_treatments(therapist_id, is_addon, treatment_menus(duration))
          `)
          .eq('id', bookingId)
          .single();

        if (bookingError || !booking) continue;

        // Per-therapist payout allocation (duo → each therapist on their own soin;
        // solo → single therapist on the total duration), with out-of-hours
        // surcharge and an aggregate cap of totalHT − hotelCommission.
        const vatRate = (booking.hotel as any)?.vat || 20;
        const totalPrice = booking.total_price || 0;
        const totalHT = totalPrice / (1 + vatRate / 100);
        const hotelCommissionPercent = (booking.hotel as any)?.hotel_commission ?? 10;
        const hotelCommission = (totalHT * hotelCommissionPercent) / 100;

        const payoutTherapists = await fetchPayoutTherapists(supabase, booking.id, booking.therapist_id);
        const payoutTreatments = (booking.booking_treatments || []).map((bt: any) => ({
          duration: bt.treatment_menus?.duration ?? null,
          therapist_id: bt.therapist_id ?? null,
          is_addon: bt.is_addon ?? false,
        }));
        const { legs: payoutLegs, totalAmount } = buildTherapistPayoutLegs({
          therapists: payoutTherapists,
          treatments: payoutTreatments,
          guestCount: (booking as any).guest_count ?? 1,
          isOutOfHours: !!(booking as any).is_out_of_hours,
          surchargePercent: Number((booking.hotel as any)?.out_of_hours_surcharge_percent ?? 0) || 0,
          capTotal: totalHT - hotelCommission,
        });

        if (payoutLegs.length === 0) {
          await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
          continue;
        }

        const paidTherapistIds = await fetchPaidTherapistIds(supabase, booking.id);
        for (const leg of payoutLegs) {
          if (paidTherapistIds.has(leg.therapistId)) continue; // idempotent
          if (!leg.stripeAccountId || leg.amount <= 0) continue;
          try {
            const transfer = await stripe.transfers.create({
              amount: Math.round(leg.amount * 100),
              currency: invoice.currency,
              destination: leg.stripeAccountId,
              description: `Paiement pour réservation #${booking.booking_id}`,
              metadata: { booking_id: booking.id, invoice_id: invoice.id, therapist_id: leg.therapistId },
            });

            await supabase.from('therapist_payouts').insert({
              therapist_id: leg.therapistId,
              booking_id: booking.id,
              amount: leg.amount,
              status: 'completed',
              stripe_transfer_id: transfer.id,
            });
          } catch (transferError) {
            await supabase.from('therapist_payouts').insert({
              therapist_id: leg.therapistId,
              booking_id: booking.id,
              amount: leg.amount,
              status: 'failed',
              error_message: transferError instanceof Error ? transferError.message : String(transferError),
            });
          }
        }

        const oomCommission = Math.round(((booking.total_price || 0) - totalAmount) * 100) / 100;
        await supabase.from('hotel_ledger').insert({
          hotel_id: booking.hotel_id,
          booking_id: booking.id,
          amount: oomCommission,
          status: 'paid',
          description: `Paiement carte - Réservation #${booking.booking_id}`,
        });

        await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
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

      log.warn("payment.declined", {
        bookingId: booking.id,
        bookingNumber: booking.booking_id,
        error_code: errorDetails?.code,
        decline_code: errorDetails?.decline_code,
        card_brand: errorDetails?.payment_method?.card?.brand,
        source: "checkout.session.async_payment_failed",
      });

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

      log.warn("payment.declined", {
        bookingId: existingBooking.id,
        bookingNumber: existingBooking.booking_id,
        error_code: errorDetails?.code,
        decline_code: errorDetails?.decline_code,
        card_brand: errorDetails?.payment_method?.card?.brand,
        source: "payment_intent.payment_failed",
      });

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
    log.error("webhook.handler_failed", error);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
  } finally {
    await log.flush();
  }
});