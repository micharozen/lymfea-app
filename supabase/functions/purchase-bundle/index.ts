import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { stripe } from "../_shared/stripe-client.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { brand, EMAIL_LOGO_URL } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Confirms a bundle purchase after Stripe payment.
 * Called from the Confirmation page with the Stripe session_id.
 *
 * 1. Retrieves the Stripe Checkout Session
 * 2. Validates payment status
 * 3. Creates customer via find_or_create_customer RPC
 * 4. Creates customer_treatment_bundles entries (no booking)
 * 5. Returns bundle details for confirmation display
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      throw new Error("Missing session ID");
    }

    // --- Retrieve Stripe session ---
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    // Check this is a bundle purchase
    if (session.metadata?.type !== 'bundle_purchase') {
      throw new Error("Invalid session type");
    }

    // Prevent double-processing: check if bundles already created for this session
    const { data: existingBundles } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id')
      .eq('payment_reference', `stripe:${sessionId}`)
      .limit(1);

    if (existingBundles && existingBundles.length > 0) {
      // Already processed — return existing bundle IDs
      const { data: allBundles } = await supabaseAdmin
        .from('customer_treatment_bundles')
        .select('id, bundle_id, total_sessions, total_amount_cents, expires_at, redemption_code, is_gift, gift_delivery_mode, recipient_name, treatment_bundles(name, name_en, bundle_type, amount_cents)')
        .eq('payment_reference', `stripe:${sessionId}`);

      return new Response(
        JSON.stringify({
          success: true,
          alreadyProcessed: true,
          customerBundles: allBundles,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('[PURCHASE-BUNDLE] Session metadata:', JSON.stringify(session.metadata));

    const {
      hotelId,
      firstName,
      lastName,
      clientEmail,
      phone,
      bundleItems: bundleItemsJson,
      isGift: isGiftMeta,
      giftDeliveryMode,
      senderName,
      senderEmail,
      recipientName,
      recipientEmail,
      giftMessage,
    } = session.metadata!;

    const bundleItems = JSON.parse(bundleItemsJson);

    // --- Find or create customer ---
    const { data: customerId, error: customerError } = await supabaseAdmin.rpc('find_or_create_customer', {
      _phone: phone,
      _first_name: firstName,
      _last_name: lastName,
      _email: clientEmail,
    });

    if (customerError) {
      console.error('[PURCHASE-BUNDLE] Error finding/creating customer:', customerError);
      throw new Error("Failed to create customer record");
    }

    // --- Fetch bundle templates to determine types ---
    const bundleIds = bundleItems.map((b: { bundleId: string }) => b.bundleId);
    const { data: bundleTemplates, error: templatesError } = await supabaseAdmin
      .from('treatment_bundles')
      .select('id, bundle_type')
      .in('id', bundleIds);

    if (templatesError || !bundleTemplates) {
      throw new Error("Failed to fetch bundle templates");
    }

    const templateTypeMap = new Map(bundleTemplates.map(t => [t.id, t.bundle_type]));

    // --- Create customer bundles ---
    const createdBundles: { id: string; bundleId: string }[] = [];
    const paymentRef = `stripe:${sessionId}`;

    for (const item of bundleItems) {
      const qty = item.quantity || 1;
      const bundleType = templateTypeMap.get(item.bundleId) ?? 'cure';

      for (let i = 0; i < qty; i++) {
        let customerBundleId: string;

        if (bundleType === 'cure') {
          const { data, error: createError } = await supabaseAdmin.rpc('create_customer_bundle', {
            _customer_id: customerId,
            _bundle_id: item.bundleId,
            _hotel_id: hotelId,
            _booking_id: null,
          });

          if (createError) {
            console.error('[PURCHASE-BUNDLE] Failed to create customer bundle:', createError.message);
            throw new Error(`Failed to create bundle: ${createError.message}`);
          }
          customerBundleId = data;
        } else {
          // gift_treatments or gift_amount → use create_customer_gift_card
          const { data, error: createError } = await supabaseAdmin.rpc('create_customer_gift_card', {
            _bundle_id: item.bundleId,
            _purchaser_customer_id: customerId,
            _hotel_id: hotelId,
            _is_gift: false,
            _payment_reference: paymentRef,
          });

          if (createError) {
            console.error('[PURCHASE-BUNDLE] Failed to create gift card:', createError.message);
            throw new Error(`Failed to create gift card: ${createError.message}`);
          }
          customerBundleId = data[0].customer_bundle_id;
        }

        // Tag with stripe session for idempotency (gift cards already have it via _payment_reference)
        if (bundleType === 'cure') {
          await supabaseAdmin
            .from('customer_treatment_bundles')
            .update({ payment_reference: paymentRef })
            .eq('id', customerBundleId);
        }

        createdBundles.push({ id: customerBundleId, bundleId: item.bundleId });
      }
    }

    // --- Fetch bundle details for confirmation ---
    const bundleDetailIds = createdBundles.map(b => b.id);
    const { data: bundleDetails } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id, bundle_id, total_sessions, expires_at, treatment_bundles(name, name_en)')
      .in('id', bundleDetailIds);

    // --- Send confirmation email only for cure bundles (not gift cards) ---
    const hasNonGiftBundles = bundleDetails?.some((b: any) => b.treatment_bundles?.bundle_type === 'cure');
    if (hasNonGiftBundles) {
      try {
        await supabaseAdmin.functions.invoke('send-booking-confirmation', {
          body: {
            type: 'bundle_purchase',
            email: clientEmail,
            firstName,
            lastName,
            hotelId,
            bundles: bundleDetails,
          },
        });
      } catch (emailError) {
        console.error('[PURCHASE-BUNDLE] Email sending failed (non-blocking):', emailError);
      }
    }

    // --- Fetch venue for email templates ---
    const { data: venue } = await supabaseAdmin
      .from('hotels')
      .select('name, image')
      .eq('id', hotelId)
      .single();
    const venueName = venue?.name || '';
    const logoUrl = venue?.image || EMAIL_LOGO_URL;

    // --- Send gift card email to recipient via Resend template ---
    const isGift = isGiftMeta === 'true';
    console.log('[PURCHASE-BUNDLE] Gift email check — isGift:', isGift, 'recipientEmail:', recipientEmail, 'deliveryMode:', giftDeliveryMode);
    console.log('[PURCHASE-BUNDLE] Condition result:', isGift && recipientEmail && giftDeliveryMode === 'email');
    if (isGift && recipientEmail && giftDeliveryMode === 'email') {
      try {
        // Build template variables from the first gift bundle
        const giftBundle = bundleDetails?.find((b: any) => b.is_gift);
        const bundleName = giftBundle?.treatment_bundles?.name ?? 'Carte Cadeau';
        const amountCents = giftBundle?.total_amount_cents ?? giftBundle?.treatment_bundles?.amount_cents ?? 0;
        const valueDisplay = `${(amountCents / 100).toFixed(0)} EUR`;
        const expiryDate = giftBundle?.expires_at
          ? new Date(giftBundle.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';

        const siteUrl = Deno.env.get('SITE_URL') || brand.website;
        const activateUrl = `${siteUrl}/portal/redeem`;
        const redemptionCode = giftBundle?.redemption_code ?? '';

        const result = await sendEmail({
          to: recipientEmail,
          subject: `You've received a gift card — ${venueName}`,
          templateId: '1b1674f1-5145-4bb5-8fce-b8b9f2c405ac',
          templateVariables: {
            logo_url: logoUrl,
            recipient_name: recipientName || '',
            recipient_email: recipientEmail,
            venue_name: venueName,
            bundle_title: bundleName,
            value_display: valueDisplay,
            expiry_date: expiryDate,
            activate_url: activateUrl,
            sender_name: senderName || firstName || '',
            gift_message: giftMessage || '',
            redemption_code: redemptionCode,
          },
        });

        if (result.error) {
          console.error('[PURCHASE-BUNDLE] Resend API error for gift email:', result.error);
        } else {
          console.log('[PURCHASE-BUNDLE] Gift recipient email sent to:', recipientEmail, 'id:', result.id);
        }
      } catch (giftEmailError) {
        console.error('[PURCHASE-BUNDLE] Gift recipient email failed (non-blocking):', giftEmailError);
      }
    }

    // --- Send cure confirmation email to buyer via Resend template ---
    const cureBundles = bundleDetails?.filter((b: any) => b.treatment_bundles?.bundle_type === 'cure');
    if (cureBundles && cureBundles.length > 0) {
      try {
        const cureBundle = cureBundles[0];
        const bundleName = cureBundle.treatment_bundles?.name ?? 'Cure';
        const totalSessions = cureBundle.total_sessions ?? 0;
        const valueDisplay = `${totalSessions} session${totalSessions > 1 ? 's' : ''}`;
        const expiryDate = cureBundle.expires_at
          ? new Date(cureBundle.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';

        const siteUrl = Deno.env.get('SITE_URL') || brand.website;
        const bookingUrl = `${siteUrl}/client/${hotelId}/treatments`;

        const result = await sendEmail({
          to: clientEmail,
          subject: `Your treatment package is activated — ${venueName}`,
          templateId: '378deb7f-307f-40e9-8054-6bf0c29beef9',
          templateVariables: {
            logo_url: logoUrl,
            recipient_name: firstName || '',
            venue_name: venueName,
            bundle_title: bundleName,
            value_display: valueDisplay,
            expiry_date: expiryDate,
            booking_url: bookingUrl,
          },
        });

        if (result.error) {
          console.error('[PURCHASE-BUNDLE] Resend API error for cure email:', result.error);
        }

        console.log('[PURCHASE-BUNDLE] Cure confirmation email sent to:', clientEmail);
      } catch (cureEmailError) {
        console.error('[PURCHASE-BUNDLE] Cure email failed (non-blocking):', cureEmailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        customerBundles: bundleDetails,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PURCHASE-BUNDLE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
