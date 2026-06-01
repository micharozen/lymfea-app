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

interface PendingVenue {
  name: string;
  address: string;
  venue_type: "hotel" | "spa";
  postal_code?: string;
  city?: string;
  country?: string;
}

function parsePendingVenue(raw: unknown): PendingVenue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const address = typeof r.address === "string" ? r.address.trim() : "";
  const venueType = r.venue_type === "spa" ? "spa" : r.venue_type === "hotel" ? "hotel" : null;
  if (!name || !address || !venueType) return null;
  const postalCode = typeof r.postal_code === "string" ? r.postal_code.trim() : "";
  const city = typeof r.city === "string" ? r.city.trim() : "";
  const country = typeof r.country === "string" ? r.country.trim() : "";
  return {
    name,
    address,
    venue_type: venueType,
    postal_code: postalCode || undefined,
    city: city || undefined,
    country: country || undefined,
  };
}

export async function handleCompleteOnboardingVenue(
  ctx: ActionContext,
): Promise<Response> {
  // 1. Resolve the user's organization (must exist; created by
  //    complete-organization-signup before Stripe checkout).
  const { data: adminRow } = await ctx.supabase
    .from("admins")
    .select("organization_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const organizationId = adminRow?.organization_id as string | null;
  if (!organizationId) {
    return json({ error: "No organization for user" }, 403);
  }

  // 2. Verify the subscription is in a state that allows venue creation
  //    (mirrors the enforce_hotel_seat_capacity() trigger contract).
  const { data: hasBilling, error: billingErr } = await ctx.supabase.rpc(
    "organization_has_active_billing",
    { _org: organizationId },
  );
  if (billingErr) {
    return json({ error: `Billing check failed: ${billingErr.message}` }, 500);
  }
  if (!hasBilling) {
    return json({ error: "Subscription is not active yet" }, 409);
  }

  // 3. Read the subscription and its pending_venue metadata.
  const { data: sub, error: subErr } = await ctx.supabase
    .from("subscriptions")
    .select("id, metadata")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (subErr) {
    return json({ error: `Subscription lookup failed: ${subErr.message}` }, 500);
  }
  if (!sub) {
    return json({ error: "Subscription row not found" }, 404);
  }

  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const pending = parsePendingVenue(metadata.pending_venue);

  // 4. Idempotence: if there's no pending venue, check if a venue already
  //    exists for this org and return it. Otherwise we have nothing to do.
  if (!pending) {
    const { data: existing } = await ctx.supabase
      .from("hotels")
      .select("id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return json({ venue_id: existing.id });
    }
    return json({ error: "No pending venue and no existing venue" }, 409);
  }

  // 5. Create the venue.
  const { data: hotel, error: hotelErr } = await ctx.supabase
    .from("hotels")
    .insert({
      organization_id: organizationId,
      name: pending.name,
      address: pending.address,
      postal_code: pending.postal_code ?? null,
      city: pending.city ?? null,
      country: pending.country ?? null,
      venue_type: pending.venue_type,
      status: "active",
    })
    .select("id")
    .single();
  if (hotelErr || !hotel) {
    return json(
      { error: `Failed to create venue: ${hotelErr?.message ?? "unknown"}` },
      500,
    );
  }

  // 6. Drain pending_venue from metadata so subsequent calls are no-ops.
  const nextMetadata = { ...metadata };
  delete nextMetadata.pending_venue;
  await ctx.supabase
    .from("subscriptions")
    .update({ metadata: nextMetadata })
    .eq("id", sub.id);

  return json({ venue_id: hotel.id });
}
