// Consolidated Onboarding edge function — routes one of N actions to the
// right handler. Mirrors the stripe-billing/index.ts pattern.
//
// Actions:
//   - complete-organization-signup : create org + user_roles + admins row for
//                                    a freshly signed-up user.
//   - complete-onboarding-venue    : after Stripe Checkout success, drain
//                                    subscriptions.metadata.pending_venue into
//                                    a hotels row.
//
// Auth: Bearer JWT only (no admins-row requirement at router level — each
// action validates its own constraints).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createLogger } from "../_shared/logger.ts";

import { handleCompleteOrganizationSignup } from "./actions/completeOrganizationSignup.ts";
import { handleCompleteOnboardingVenue } from "./actions/completeOnboardingVenue.ts";

export interface ActionContext {
  req: Request;
  body: Record<string, unknown>;
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  userMetadata: Record<string, unknown>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ActionHandler = (ctx: ActionContext) => Promise<Response>;

const actions: Record<string, ActionHandler> = {
  "complete-organization-signup": handleCompleteOrganizationSignup,
  "complete-onboarding-venue": handleCompleteOnboardingVenue,
};

interface AuthResult {
  userId: string;
  email: string | null;
  metadata: Record<string, unknown>;
}

async function authenticate(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createLogger({ function: "onboarding", req });

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

  log.bind({ action, userId: auth.userId });

  try {
    return await handler({
      req,
      body,
      supabase: supabaseAdmin,
      userId: auth.userId,
      userEmail: auth.email,
      userMetadata: auth.metadata,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("action.failed", err);
    return jsonResponse({ error: message }, 500);
  } finally {
    await log.flush();
  }
});
