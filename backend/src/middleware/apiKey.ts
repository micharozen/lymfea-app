import type { Context, Next } from "hono";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Context attached to requests authenticated with a third-party API key.
 */
export interface ApiKeyContext {
  id: string;
  name: string;
  /** When set, the key is scoped to a single venue. NULL = platform-wide. */
  hotelId: string | null;
  /** When set, the key belongs to an organization — /v1/* reads filter on this. */
  organizationId: string | null;
  scopes: string[];
}

/**
 * Middleware: validate a third-party API key.
 *
 * Reads the key from `Authorization: Bearer sk_live_…` (or the `X-Api-Key`
 * header), then calls the `gateway_verify_api_key` RPC, which decrypts the
 * stored secret from the Vault and compares it server-side. The metadata table
 * and the Vault are never touched directly from here.
 *
 * Mirrors the conventions of middleware/auth.ts (the JWT middleware used for
 * the app's own traffic).
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const headerKey = c.req.header("X-Api-Key");

  let key: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice("Bearer ".length).trim();
  } else if (headerKey) {
    key = headerKey.trim();
  }

  if (!key) {
    return c.json({ error: "Missing API key" }, 401);
  }

  const { data, error } = await supabaseAdmin.rpc("gateway_verify_api_key", {
    _key: key,
  });

  if (error) {
    console.error("gateway_verify_api_key error:", error);
    return c.json({ error: "Authentication failed" }, 500);
  }

  if (!data) {
    return c.json({ error: "Invalid or revoked API key" }, 401);
  }

  c.set("apiKey", {
    id: data.id,
    name: data.name,
    hotelId: data.hotel_id ?? null,
    organizationId: data.organization_id ?? null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
  } satisfies ApiKeyContext);

  await next();
}

/**
 * Middleware: require that the API key carries all of the given scopes.
 * Must be used after apiKeyMiddleware.
 */
export function requireScope(...scopes: string[]) {
  return async (c: Context, next: Next) => {
    const apiKey = c.get("apiKey") as ApiKeyContext | undefined;

    if (!apiKey) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const missing = scopes.filter((s) => !apiKey.scopes.includes(s));
    if (missing.length > 0) {
      return c.json(
        { error: "Insufficient scope", missing },
        403
      );
    }

    await next();
  };
}
