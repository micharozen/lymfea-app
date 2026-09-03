import { brand, EMAIL_LOGO_URL } from "../../_shared/brand.ts";
import { sendEmail } from "../../_shared/send-email.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Mail « vous avez reçu une carte cadeau », aligné sur le design des autres
 * e-mails clients (getExternalClientPaymentEmailHtml) : fond blanc, serif,
 * encart crème bordé d'or, bouton bleu nuit, signature de marque.
 */
function getGiftCardEmailHtml(opts: {
  lang: 'fr' | 'en';
  logoUrl: string;
  venueImageUrl: string;
  venueName: string;
  recipientName: string;
  bundleName: string;
  valueLabel: string;
  valueDisplay: string;
  expiryDate: string;
  activateUrl: string;
  senderName: string;
  giftMessage: string;
}): string {
  const isFr = opts.lang === 'fr';
  const sender = opts.senderName || (isFr ? 'Quelqu\'un' : 'Someone');

  const labels = isFr ? {
    greeting: opts.recipientName ? `Chère ${opts.recipientName}` : 'Bonjour',
    intro: `${sender} vous offre une carte cadeau à découvrir chez ${opts.venueName}.`,
    detailsTitle: 'VOTRE CARTE CADEAU',
    validUntil: 'Valable jusqu\'au',
    messageFrom: `UN MOT DE ${sender.toUpperCase()}`,
    cta: 'ACTIVER MA CARTE CADEAU',
    hint: 'Le bouton ci-dessus vous permet de créer votre espace personnel et de réserver le soin de votre choix.',
  } : {
    greeting: opts.recipientName ? `Dear ${opts.recipientName}` : 'Hello',
    intro: `${sender} has offered you a gift card to enjoy at ${opts.venueName}.`,
    detailsTitle: 'YOUR GIFT CARD',
    validUntil: 'Valid until',
    messageFrom: `A WORD FROM ${sender.toUpperCase()}`,
    cta: 'ACTIVATE MY GIFT CARD',
    hint: 'The button above lets you create your personal space and book the treatment of your choice.',
  };

  const styles = {
    card: 'background-color:#FEFBF7;border:1px solid #C5B197;padding:30px;border-radius:4px;',
    button: 'background-color:#000351;color:#ffffff;padding:16px 32px;text-decoration:none;display:inline-block;font-family:Georgia,serif;font-size:14px;letter-spacing:1px;border-radius:2px;',
    messageCard: 'background-color:#FEFBF7;padding:20px;font-size:13px;color:#555;font-style:italic;text-align:left;',
  };

  return `
    <!DOCTYPE html>
    <html lang="${opts.lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#ffffff;color:#000000;-webkit-font-smoothing:antialiased;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <img src="${opts.logoUrl}" alt="${brand.name}" width="140" style="display:block;margin-bottom:40px;">
            ${opts.venueImageUrl ? `
            <img src="${opts.venueImageUrl}" alt="${opts.venueName}" style="display:block;width:100%;max-width:600px;height:auto;margin-bottom:40px;border-radius:4px;">
            ` : ''}

            <table width="600" border="0" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;">
              <tr>
                <td align="center" style="font-family:Georgia,'Times New Roman',serif;">
                  <h1 style="font-weight:normal;font-size:24px;margin-bottom:20px;">${labels.greeting},</h1>
                  <p style="font-size:16px;line-height:1.6;margin-bottom:40px;padding:0 40px;">${labels.intro}</p>

                  <div style="${styles.card}">
                    <p style="font-size:11px;letter-spacing:2px;color:#C5B197;margin-bottom:20px;">${labels.detailsTitle}</p>
                    <p style="font-size:18px;margin-bottom:10px;"><strong>${opts.bundleName}</strong></p>
                    <p style="font-size:14px;margin-bottom:25px;color:#666;">${opts.venueName}</p>

                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top:1px solid #C5B197;padding-top:20px;">
                      <tr>
                        <td align="left" style="padding:5px 0;font-size:14px;color:#666;">${opts.valueLabel}</td>
                        <td align="right" style="padding:5px 0;font-size:16px;color:#000351;"><strong>${opts.valueDisplay}</strong></td>
                      </tr>
                      ${opts.expiryDate ? `
                      <tr>
                        <td align="left" style="padding:5px 0;font-size:14px;color:#666;">${labels.validUntil}</td>
                        <td align="right" style="padding:5px 0;font-size:14px;">${opts.expiryDate}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </div>

                  ${opts.giftMessage ? `
                  <div style="${styles.messageCard}">
                    <p style="margin:0 0 10px;font-weight:bold;font-style:normal;font-size:10px;letter-spacing:1px;">${labels.messageFrom}</p>
                    « ${opts.giftMessage} »
                  </div>
                  ` : ''}

                  <div style="padding:40px 0;text-align:center;">
                    <a href="${opts.activateUrl}" style="${styles.button}">${labels.cta}</a>
                    <p style="font-size:13px;margin-top:16px;line-height:1.6;color:#555;font-family:Georgia,serif;font-style:italic;padding:0 40px;">${labels.hint}</p>
                  </div>

                  <div style="padding:20px 0 40px;font-size:10px;letter-spacing:3px;color:#999;">
                    ${brand.name.toUpperCase()}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function handlePurchaseBundle(
  ctx: ActionContext,
): Promise<Response> {
  const { body, supabase } = ctx;
  let stripe = ctx.stripe;
  const { sessionId } = body as { sessionId?: string };

  if (!sessionId) {
    throw new Error("Missing session ID");
  }

  // Re-resolve client per session metadata if needed (session was created with
  // the venue's Stripe key).
  let session = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    session.metadata?.hotelId &&
    session.metadata.hotelId !== ctx.hotelId
  ) {
    const resolved = await getStripeForVenue(supabase, session.metadata.hotelId);
    stripe = resolved.client;
    session = await stripe.checkout.sessions.retrieve(sessionId);
  }

  if (session.payment_status !== "paid") {
    throw new Error("Payment not completed");
  }

  if (session.metadata?.type !== "bundle_purchase") {
    throw new Error("Invalid session type");
  }

  const { data: existingBundles } = await supabase
    .from("customer_treatment_bundles")
    .select("id")
    .eq("payment_reference", `stripe:${sessionId}`)
    .limit(1);

  if (existingBundles && existingBundles.length > 0) {
    const { data: allBundles } = await supabase
      .from("customer_treatment_bundles")
      .select(
        "id, bundle_id, total_sessions, total_amount_cents, expires_at, redemption_code, is_gift, gift_delivery_mode, recipient_name, treatment_bundles(name, name_en, bundle_type, amount_cents)",
      )
      .eq("payment_reference", `stripe:${sessionId}`);

    return jsonResponse({
      success: true,
      alreadyProcessed: true,
      customerBundles: allBundles,
    });
  }

  console.log(
    "[PURCHASE-BUNDLE] Session metadata:",
    JSON.stringify(session.metadata),
  );

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
    language,
    recipientLanguage,
  } = session.metadata!;

  const bundleItems = JSON.parse(bundleItemsJson);

  const { data: customerId, error: customerError } = await supabase.rpc(
    "find_or_create_customer",
    {
      _phone: phone,
      _first_name: firstName,
      _last_name: lastName,
      _email: clientEmail,
    },
  );

  if (customerError) {
    console.error(
      "[PURCHASE-BUNDLE] Error finding/creating customer:",
      customerError,
    );
    throw new Error("Failed to create customer record");
  }

  const bundleIds = bundleItems.map((b: { bundleId: string }) => b.bundleId);
  const { data: bundleTemplates, error: templatesError } = await supabase
    .from("treatment_bundles")
    .select("id, bundle_type")
    .in("id", bundleIds);

  if (templatesError || !bundleTemplates) {
    throw new Error("Failed to fetch bundle templates");
  }

  const templateTypeMap = new Map(
    bundleTemplates.map((t: any) => [t.id, t.bundle_type]),
  );

  const createdBundles: { id: string; bundleId: string }[] = [];
  const paymentRef = `stripe:${sessionId}`;

  for (const item of bundleItems) {
    const qty = item.quantity || 1;
    const bundleType = templateTypeMap.get(item.bundleId) ?? "cure";

    for (let i = 0; i < qty; i++) {
      let customerBundleId: string;

      if (bundleType === "cure") {
        const { data, error: createError } = await supabase.rpc(
          "create_customer_bundle",
          {
            _customer_id: customerId,
            _bundle_id: item.bundleId,
            _hotel_id: hotelId,
            _booking_id: null,
          },
        );

        if (createError) {
          console.error(
            "[PURCHASE-BUNDLE] Failed to create customer bundle:",
            createError.message,
          );
          throw new Error(`Failed to create bundle: ${createError.message}`);
        }
        customerBundleId = data;
      } else {
        const isGift = isGiftMeta === "true";
        const { data, error: createError } = await supabase.rpc(
          "create_customer_gift_card",
          {
            _bundle_id: item.bundleId,
            _purchaser_customer_id: customerId,
            _hotel_id: hotelId,
            _is_gift: isGift,
            _gift_delivery_mode: isGift ? giftDeliveryMode || "email" : null,
            _sender_name: isGift ? senderName || null : null,
            _sender_email: isGift ? senderEmail || null : null,
            _recipient_name: isGift ? recipientName || null : null,
            _recipient_email: isGift ? recipientEmail || null : null,
            _gift_message: isGift ? giftMessage || null : null,
            _payment_reference: paymentRef,
          },
        );

        if (createError) {
          console.error(
            "[PURCHASE-BUNDLE] Failed to create gift card:",
            createError.message,
          );
          throw new Error(`Failed to create gift card: ${createError.message}`);
        }
        customerBundleId = data[0].customer_bundle_id;
      }

      if (bundleType === "cure") {
        await supabase
          .from("customer_treatment_bundles")
          .update({ payment_reference: paymentRef })
          .eq("id", customerBundleId);
      }

      createdBundles.push({ id: customerBundleId, bundleId: item.bundleId });
    }
  }

  const bundleDetailIds = createdBundles.map((b) => b.id);
  const { data: bundleDetails } = await supabase
    .from("customer_treatment_bundles")
    .select(
      "id, bundle_id, total_sessions, total_amount_cents, expires_at, redemption_code, is_gift, gift_delivery_mode, recipient_name, treatment_bundles(name, name_en, bundle_type, amount_cents)",
    )
    .in("id", bundleDetailIds);

  const hasNonGiftBundles = bundleDetails?.some(
    (b: any) => b.treatment_bundles?.bundle_type === "cure",
  );
  if (hasNonGiftBundles) {
    try {
      await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          type: "bundle_purchase",
          email: clientEmail,
          firstName,
          lastName,
          hotelId,
          bundles: bundleDetails,
        },
      });
    } catch (emailError) {
      console.error(
        "[PURCHASE-BUNDLE] Email sending failed (non-blocking):",
        emailError,
      );
    }
  }

  const { data: venue } = await supabase
    .from("hotels")
    .select("slug, name, image")
    .eq("id", hotelId)
    .single();
  const venueName = venue?.name || "";
  const venueSlug = venue?.slug || hotelId;
  const logoUrl = venue?.image || EMAIL_LOGO_URL;

  const isGift = isGiftMeta === "true";
  if (isGift && recipientEmail && giftDeliveryMode === "email") {
    try {
      const giftBundle = bundleDetails?.[0];
      // L'embed PostgREST d'un FK many-to-one est un objet, mais le typage
      // généré l'annonce en tableau : on normalise avant de le lire.
      const rawTemplate = giftBundle?.treatment_bundles as unknown;
      const giftTemplate = (Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate) as
        | { name?: string; bundle_type?: string; amount_cents?: number }
        | undefined;
      const bundleName = giftTemplate?.name ?? "Carte Cadeau";
      const lang = (recipientLanguage === 'en' || language === 'en') ? 'en' : 'fr';

      // Une carte cadeau vaut soit un montant, soit un nombre de séances : ne
      // jamais afficher « 0 EUR » sur une carte en séances.
      const giftSessions = giftBundle?.total_sessions ?? 0;
      const amountCents =
        giftBundle?.total_amount_cents ??
        giftTemplate?.amount_cents ??
        0;
      const isSessionGift =
        giftTemplate?.bundle_type === "gift_treatments" && giftSessions > 0;
      const valueLabel = isSessionGift
        ? (lang === "en" ? "Sessions" : "Séances")
        : (lang === "en" ? "Value" : "Valeur");
      const valueDisplay = isSessionGift
        ? `${giftSessions} ${lang === "en"
            ? (giftSessions > 1 ? "sessions" : "session")
            : (giftSessions > 1 ? "séances" : "séance")}`
        : `${(amountCents / 100).toFixed(0)} €`;

      const expiryDate = giftBundle?.expires_at
        ? new Date(giftBundle.expires_at).toLocaleDateString(
            lang === "en" ? "en-GB" : "fr-FR",
            { day: "numeric", month: "long", year: "numeric" },
          )
        : "";

      const siteUrl = (Deno.env.get("SITE_URL") || `https://${brand.appDomain}`)
        .replace(/\/+$/, "");
      const activateUrl = `${siteUrl}/portal/redeem?token=${encodeURIComponent(
        giftBundle?.redemption_code ?? "",
      )}`;

      const subject = lang === 'en'
        ? `You've received a gift card — ${venueName}`
        : `Vous avez reçu une carte cadeau — ${venueName}`;

      const htmlBody = getGiftCardEmailHtml({
        lang,
        logoUrl: EMAIL_LOGO_URL,
        venueImageUrl: venue?.image || "",
        venueName,
        recipientName: recipientName || "",
        bundleName,
        valueLabel,
        valueDisplay,
        expiryDate,
        activateUrl,
        senderName: senderName || firstName || "",
        giftMessage: giftMessage || "",
      });

      const result = await sendEmail({
        to: recipientEmail,
        subject,
        html: htmlBody,
      });

      if (result.error) {
        console.error(
          "[PURCHASE-BUNDLE] Resend API error for gift email:",
          result.error,
        );
      } else {
        console.log(
          "[PURCHASE-BUNDLE] Gift recipient email sent to:",
          recipientEmail,
          "id:",
          result.id,
        );
      }
    } catch (giftEmailError) {
      console.error(
        "[PURCHASE-BUNDLE] Gift recipient email failed (non-blocking):",
        giftEmailError,
      );
    }
  }

  const cureBundles = bundleDetails?.filter(
    (b: any) => b.treatment_bundles?.bundle_type === "cure",
  );
  if (cureBundles && cureBundles.length > 0) {
    try {
      const cureBundle = cureBundles[0];
      const bundleName = cureBundle.treatment_bundles?.name ?? "Cure";
      const totalSessions = cureBundle.total_sessions ?? 0;
      const valueDisplay = `${totalSessions} session${
        totalSessions > 1 ? "s" : ""
      }`;
      const expiryDate = cureBundle.expires_at
        ? new Date(cureBundle.expires_at).toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";

      const siteUrl = Deno.env.get("SITE_URL") || brand.website;
      const bookingUrl = `${siteUrl}/client/${venueSlug}/treatments`;

      const result = await sendEmail({
        to: clientEmail,
        subject: `Your treatment package is activated — ${venueName}`,
        templateId: "378deb7f-307f-40e9-8054-6bf0c29beef9",
        templateVariables: {
          logo_url: logoUrl,
          recipient_name: firstName || "",
          venue_name: venueName,
          bundle_title: bundleName,
          value_display: valueDisplay,
          expiry_date: expiryDate,
          booking_url: bookingUrl,
        },
      });

      if (result.error) {
        console.error(
          "[PURCHASE-BUNDLE] Resend API error for cure email:",
          result.error,
        );
      }
    } catch (cureEmailError) {
      console.error(
        "[PURCHASE-BUNDLE] Cure email failed (non-blocking):",
        cureEmailError,
      );
    }
  }

  return jsonResponse({
    success: true,
    customerBundles: bundleDetails,
  });
}
