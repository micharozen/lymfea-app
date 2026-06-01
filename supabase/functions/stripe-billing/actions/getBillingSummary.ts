import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleGetBillingSummary(
  ctx: ActionContext,
): Promise<Response> {
  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select(
      "stripe_customer_id, default_payment_method, status, current_period_end",
    )
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.stripe_customer_id || sub.stripe_customer_id.startsWith("manual:")) {
    return json({ invoices: [], payment_method: null });
  }

  const invoicesList = await ctx.stripe.invoices.list({
    customer: sub.stripe_customer_id,
    limit: 12,
  });

  let paymentMethod: { brand: string; last4: string; exp_month: number; exp_year: number } | null = null;
  if (sub.default_payment_method) {
    try {
      const pm = await ctx.stripe.paymentMethods.retrieve(
        sub.default_payment_method,
      );
      if (pm.card) {
        paymentMethod = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    } catch {
      // ignore: PM may have been detached
    }
  }

  return json({
    invoices: invoicesList.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_paid_cents: inv.amount_paid,
      amount_due_cents: inv.amount_due,
      currency: inv.currency,
      created: inv.created,
      period_start: inv.period_start,
      period_end: inv.period_end,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    })),
    payment_method: paymentMethod,
  });
}
