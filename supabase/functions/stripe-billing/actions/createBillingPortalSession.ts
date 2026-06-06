import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleCreateBillingPortalSession(
  ctx: ActionContext,
): Promise<Response> {
  const returnUrl = String(ctx.body.return_url ?? "");
  if (!returnUrl) return json({ error: "return_url is required" }, 400);

  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.stripe_customer_id || sub.stripe_customer_id.startsWith("manual:")) {
    return json(
      { error: "No Stripe customer for this organization yet" },
      404,
    );
  }

  const session = await ctx.stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });

  return json({ url: session.url });
}
