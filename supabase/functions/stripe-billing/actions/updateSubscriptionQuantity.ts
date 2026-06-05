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

type Mode = "preview" | "confirm";

export async function handleUpdateSubscriptionQuantity(
  ctx: ActionContext,
): Promise<Response> {
  const delta = Number(ctx.body.delta ?? 0);
  const mode = (ctx.body.mode === "confirm" ? "confirm" : "preview") as Mode;

  if (!Number.isInteger(delta) || delta === 0) {
    return json({ error: "delta must be a non-zero integer" }, 400);
  }

  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select(
      "id, seats, status, stripe_subscription_id, stripe_subscription_item_id, stripe_customer_id",
    )
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub) return json({ error: "No subscription for this organization" }, 404);
  if (!sub.stripe_subscription_id || !sub.stripe_subscription_item_id) {
    return json(
      {
        error:
          "Subscription is not provisioned in Stripe yet. Complete checkout first.",
      },
      409,
    );
  }
  if (!["trialing", "active", "past_due"].includes(sub.status)) {
    return json(
      { error: `Subscription status '${sub.status}' does not allow seat changes` },
      409,
    );
  }

  const newSeats = sub.seats + delta;
  if (newSeats < 1) {
    return json({ error: "Cannot reduce seats below 1" }, 400);
  }

  if (mode === "preview") {
    // Stripe replaced invoices.retrieveUpcoming with invoices.createPreview
    // in newer API versions. Param shapes differ slightly (subscription_details).
    const upcoming = await (
      ctx.stripe.invoices as unknown as {
        createPreview: (params: unknown) => Promise<{
          amount_due: number;
          currency: string;
          total: number;
          subtotal: number;
          lines: { data: Array<{ amount: number; description: string | null }> };
        }>;
      }
    ).createPreview({
      customer: sub.stripe_customer_id,
      subscription: sub.stripe_subscription_id,
      subscription_details: {
        items: [
          {
            id: sub.stripe_subscription_item_id,
            quantity: newSeats,
          },
        ],
        proration_behavior: "create_prorations",
      },
    });

    return json({
      mode,
      current_seats: sub.seats,
      new_seats: newSeats,
      proration: {
        amount_due_cents: upcoming.amount_due,
        currency: upcoming.currency,
        total_cents: upcoming.total,
        subtotal_cents: upcoming.subtotal,
        lines: upcoming.lines.data.map((l) => ({
          amount_cents: l.amount,
          description: l.description,
        })),
      },
    });
  }

  // Confirm: actually update the Stripe subscription item.
  await ctx.stripe.subscriptionItems.update(sub.stripe_subscription_item_id, {
    quantity: newSeats,
    proration_behavior: "create_prorations",
  });

  // Webhook (customer.subscription.updated) will normalize seats in DB, but
  // we update optimistically so the UI can refresh immediately.
  await ctx.supabase
    .from("subscriptions")
    .update({ seats: newSeats })
    .eq("id", sub.id);

  return json({ mode, current_seats: newSeats, new_seats: newSeats });
}
