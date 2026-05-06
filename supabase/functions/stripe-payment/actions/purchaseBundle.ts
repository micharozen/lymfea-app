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
      const bundleName = giftBundle?.treatment_bundles?.name ?? "Carte Cadeau";
      const amountCents =
        giftBundle?.total_amount_cents ??
        giftBundle?.treatment_bundles?.amount_cents ??
        0;
      const valueDisplay = `${(amountCents / 100).toFixed(0)} EUR`;
      const expiryDate = giftBundle?.expires_at
        ? new Date(giftBundle.expires_at).toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";

      const activateUrl = `https://apptest.eiaspa.fr/portal/redeem?token=${encodeURIComponent(
        giftBundle?.redemption_code ?? "",
      )}`;

      const templateVars = {
        logo_url: logoUrl,
        recipient_name: recipientName || "",
        recipient_email: recipientEmail,
        venue_name: venueName,
        bundle_title: bundleName,
        value_display: valueDisplay,
        expiry_date: expiryDate,
        activate_url: activateUrl,
        sender_name: senderName || firstName || "",
        gift_message: giftMessage || "",
        redemption_code: "",
      };

      const result = await sendEmail({
        to: recipientEmail,
        subject: `You've received a gift card — ${venueName}`,
        templateId: "1b1674f1-5145-4bb5-8fce-b8b9f2c405ac",
        templateVariables: templateVars,
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
