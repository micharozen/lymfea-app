// Consolidated Stripe Billing edge function — routes one of N actions to
// the right handler. Mirrors the stripe-payment/index.ts pattern but uses
// the BILLING Stripe account (STRIPE_BILLING_SECRET_KEY), strictly separate
// from the Connect / payouts client in _shared/stripe-resolver.ts.
//
// Usage from frontend:
//   await supabase.functions.invoke('stripe-billing', {
//     body: { action: 'create-checkout-session', plan_code, billing_cycle, ... }
//   })

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { getBillingStripe } from "../_shared/stripe-billing.ts";
import { createLogger } from "../_shared/logger.ts";

import { handleCreateCheckoutSession } from "./actions/createCheckoutSession.ts";
import { handleCreateBillingPortalSession } from "./actions/createBillingPortalSession.ts";
import { handleUpdateSubscriptionQuantity } from "./actions/updateSubscriptionQuantity.ts";
import { handleGetBillingSummary } from "./actions/getBillingSummary.ts";

export interface ActionContext {
  req: Request;
  body: Record<string, unknown>;
  supabase: SupabaseClient;
  stripe: Stripe;
  userId: string;
  organizationId: string;
  isSuperAdmin: boolean;
}

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

type ActionHandler = (ctx: ActionContext) => Promise<Response>;

const actions: Record<string, ActionHandler> = {
  "create-checkout-session": handleCreateCheckoutSession,
  "create-billing-portal-session": handleCreateBillingPortalSession,
  "update-subscription-quantity": handleUpdateSubscriptionQuantity,
  "get-billing-summary": handleGetBillingSummary,
};

interface AuthResult {
  userId: string;
  organizationId: string | null;
  isSuperAdmin: boolean;
}

async function authenticate(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  // Use a JWT-scoped client to resolve the user, then use supabaseAdmin for DB.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return null;
  const userId = userData.user.id;

  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("is_super_admin, organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!adminRow) return { userId, organizationId: null, isSuperAdmin: false };

  return {
    userId,
    organizationId: adminRow.organization_id as string | null,
    isSuperAdmin: Boolean(adminRow.is_super_admin),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createLogger({ function: "stripe-billing", req });

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    log.warn("request.invalid_json");
    await log.flush();
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    await log.flush();
    return jsonResponse({ error: "Missing 'action' in body" }, 400);
  }

  const handler = actions[action];
  if (!handler) {
    log.warn("action.unknown", { action });
    await log.flush();
    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }

  const auth = await authenticate(req);
  if (!auth) {
    log.warn("auth.missing_or_invalid", { action });
    await log.flush();
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Super-admins acting on behalf of an organization may pass it explicitly.
  const overrideOrgId =
    typeof body.organization_id === "string" ? body.organization_id : null;
  const organizationId = auth.isSuperAdmin
    ? overrideOrgId ?? auth.organizationId
    : auth.organizationId;

  if (!organizationId) {
    log.warn("auth.no_organization", { action, userId: auth.userId });
    await log.flush();
    return jsonResponse({ error: "No organization for user" }, 403);
  }

  log.bind({ action, organizationId, userId: auth.userId });

  let stripe: Stripe;
  try {
    stripe = getBillingStripe();
  } catch (err) {
    log.error("stripe.init_failed", err);
    await log.flush();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Stripe init failed" },
      500,
    );
  }

  try {
    return await handler({
      req,
      body,
      supabase: supabaseAdmin,
      stripe,
      userId: auth.userId,
      organizationId,
      isSuperAdmin: auth.isSuperAdmin,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errAny = err as { type?: string; code?: string };
    log.error("action.failed", err, {
      stripe_error_type: errAny.type,
      stripe_error_code: errAny.code,
    });
    return jsonResponse({ error: message }, 500);
  } finally {
    await log.flush();
  }
});
