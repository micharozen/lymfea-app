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

export async function handleCreateBundlePayment(
  ctx: ActionContext,
): Promise<Response> {
  const { req, body, supabase, stripe } = ctx;
  const { hotelId, clientData, bundleItems, giftData } = body as Record<string, any>;

  if (
    !hotelId ||
    !clientData ||
    !bundleItems ||
    !Array.isArray(bundleItems) ||
    bundleItems.length === 0
  ) {
    throw new Error("Missing required data");
  }
  if (
    !clientData.firstName ||
    !clientData.lastName ||
    !clientData.phone ||
    !clientData.email
  ) {
    throw new Error("Missing required client information");
  }

  const bundleIds = bundleItems
    .map((b: { bundleId: string }) => b.bundleId)
    .filter(Boolean);
  if (bundleIds.length === 0) {
    throw new Error("No valid bundle IDs provided");
  }

  const { data: bundles, error: bundlesError } = await supabase
    .from("treatment_bundles")
    .select(
      "id, name, name_en, price, currency, total_sessions, validity_days, status, hotel_id",
    )
    .in("id", bundleIds);

  if (bundlesError || !bundles || bundles.length === 0) {
    throw new Error("Failed to fetch valid bundles");
  }

  const invalidBundles = bundles.filter(
    (b: any) =>
      b.status !== "active" || (b.hotel_id !== null && b.hotel_id !== hotelId),
  );
  if (invalidBundles.length > 0) {
    throw new Error("Some bundles are not available for this hotel");
  }

  const bundleMap = new Map(bundles.map((b: any) => [b.id, b]));
  let verifiedTotal = 0;
  const lineItems: {
    price_data: {
      currency: string;
      product_data: { name: string };
      unit_amount: number;
    };
    quantity: number;
  }[] = [];

  for (const item of bundleItems) {
    const bundle = bundleMap.get(item.bundleId);
    if (!bundle) throw new Error(`Bundle ${item.bundleId} not found`);
    const qty = item.quantity || 1;
    verifiedTotal += (bundle.price || 0) * qty;
    lineItems.push({
      price_data: {
        currency: (bundle.currency || "eur").toLowerCase(),
        product_data: {
          name: `${bundle.name} (${bundle.total_sessions} séances)`,
        },
        unit_amount: Math.round((bundle.price || 0) * 100),
      },
      quantity: qty,
    });
  }

  if (verifiedTotal <= 0) {
    throw new Error("Invalid total price");
  }

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("slug, currency, name")
    .eq("id", hotelId)
    .maybeSingle();

  if (hotelError || !hotel) {
    throw new Error("Hotel not found");
  }

  let stripeCustomerId: string;
  const existingCustomers = await stripe.customers.list({
    email: clientData.email,
    limit: 1,
  });
  if (existingCustomers.data.length > 0) {
    stripeCustomerId = existingCustomers.data[0].id;
  } else {
    const newCustomer = await stripe.customers.create({
      email: clientData.email,
      name: `${clientData.firstName} ${clientData.lastName}`,
      phone: clientData.phone,
    });
    stripeCustomerId = newCustomer.id;
  }

  await supabase.from("customers").upsert(
    {
      phone: clientData.phone,
      email: clientData.email,
      first_name: clientData.firstName,
      last_name: clientData.lastName,
      stripe_customer_id: stripeCustomerId,
    },
    { onConflict: "phone" },
  );

  const origin = req.headers.get("origin") || "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: lineItems,
    success_url: `${origin}/client/${hotel.slug ?? hotelId}/confirmation/bundle?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/client/${hotel.slug ?? hotelId}/payment`,
    metadata: {
      type: "bundle_purchase",
      hotelId,
      firstName: clientData.firstName,
      lastName: clientData.lastName,
      clientEmail: clientData.email,
      phone: clientData.phone,
      roomNumber: clientData.roomNumber || "",
      note: clientData.note || "",
      bundleItems: JSON.stringify(bundleItems),
      isGift: giftData?.isGift ? "true" : "false",
      giftDeliveryMode: giftData?.deliveryMode || "",
      senderName: giftData?.senderName || "",
      senderEmail: giftData?.isGift ? clientData.email || "" : "",
      recipientName: giftData?.recipientName || "",
      recipientEmail: giftData?.recipientEmail || "",
      giftMessage: giftData?.giftMessage || "",
    },
  });

  return jsonResponse({ url: session.url, sessionId: session.id });
}
