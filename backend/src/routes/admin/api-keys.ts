import { Hono } from "hono";
import type { Context } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { authMiddleware, requireRole, type AuthUser } from "../../middleware/auth";

/**
 * Admin management of third-party API keys.
 *
 * Protected by the app's existing JWT auth + admin role. All work is delegated
 * to SECURITY DEFINER RPCs so neither the `gateway` schema nor the Vault is
 * touched directly.
 */
const apiKeys = new Hono();

apiKeys.use("*", authMiddleware);
apiKeys.use("*", requireRole("admin"));

// Resolve the calling admin's organization_id from the JWT user.
// Super-admins have no organization_id and must not use these endpoints.
async function resolveOrgId(c: Context): Promise<string | null> {
  const user = c.get("user") as AuthUser | undefined;
  if (!user) return null;
  const { data, error } = await supabaseAdmin
    .from("admins")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data?.organization_id) return null;
  return data.organization_id;
}

// ─── Org-scoped singleton (used by the /admin/api-keys page) ──────

// GET /admin/api-keys/me — metadata for the caller's org active key.
apiKeys.get("/me", async (c) => {
  const orgId = await resolveOrgId(c);
  if (!orgId) return c.json({ error: "No organization for this user" }, 403);

  const { data, error } = await supabaseAdmin.rpc("gateway_get_org_api_key", {
    _org_id: orgId,
  });
  if (error) {
    console.error("GET /admin/api-keys/me error:", error);
    return c.json({ error: "Failed to fetch API key" }, 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return c.json({ data: row ?? null });
});

// POST /admin/api-keys/me/reveal — return the cleartext key from Vault.
apiKeys.post("/me/reveal", async (c) => {
  const orgId = await resolveOrgId(c);
  if (!orgId) return c.json({ error: "No organization for this user" }, 403);

  const { data, error } = await supabaseAdmin.rpc("gateway_reveal_org_api_key", {
    _org_id: orgId,
  });
  if (error) {
    console.error("POST /admin/api-keys/me/reveal error:", error);
    return c.json({ error: "Failed to reveal API key" }, 500);
  }
  if (!data) return c.json({ error: "API key not found" }, 404);
  return c.json({ data: { api_key: data } });
});

// POST /admin/api-keys/me/regenerate — revoke active key + issue a new one.
// Returns the new key in cleartext once.
apiKeys.post("/me/regenerate", async (c) => {
  const orgId = await resolveOrgId(c);
  if (!orgId) return c.json({ error: "No organization for this user" }, 403);

  const { data, error } = await supabaseAdmin.rpc("gateway_create_org_api_key", {
    _org_id: orgId,
  });
  if (error) {
    console.error("POST /admin/api-keys/me/regenerate error:", error);
    return c.json({ error: "Failed to regenerate API key" }, 500);
  }
  return c.json({ data }, 201);
});

// ─── Super-admin CRUD (legacy, by name) ────────────────────────────

// POST /admin/api-keys — issue a key for a third party. Returns the full key once.
apiKeys.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    hotelId?: string | null;
    scopes?: string[];
    rateLimitPerMin?: number | null;
  };

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }

  const { data, error } = await supabaseAdmin.rpc("gateway_create_api_key", {
    _name: body.name.trim(),
    _hotel_id: body.hotelId ?? null,
    _scopes: body.scopes ?? [],
    _rate_limit: body.rateLimitPerMin ?? null,
  });

  if (error) {
    console.error("POST /admin/api-keys error:", error);
    return c.json({ error: "Failed to create API key" }, 500);
  }

  return c.json({ data }, 201);
});

// GET /admin/api-keys — list keys (metadata only, never the secret).
apiKeys.get("/", async (c) => {
  const { data, error } = await supabaseAdmin.rpc("gateway_list_api_keys");
  if (error) {
    console.error("GET /admin/api-keys error:", error);
    return c.json({ error: "Failed to list API keys" }, 500);
  }
  return c.json({ data });
});

// GET /admin/api-keys/:id/reveal — re-display the full key (decrypts from Vault).
apiKeys.get("/:id/reveal", async (c) => {
  const id = c.req.param("id");
  const { data, error } = await supabaseAdmin.rpc("gateway_reveal_api_key", {
    _id: id,
  });
  if (error) {
    console.error("GET /admin/api-keys/:id/reveal error:", error);
    return c.json({ error: "Failed to reveal API key" }, 500);
  }
  if (!data) {
    return c.json({ error: "API key not found" }, 404);
  }
  return c.json({ data: { api_key: data } });
});

// DELETE /admin/api-keys/:id — revoke a key.
apiKeys.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const { error } = await supabaseAdmin.rpc("gateway_revoke_api_key", {
    _id: id,
  });
  if (error) {
    console.error("DELETE /admin/api-keys/:id error:", error);
    return c.json({ error: "Failed to revoke API key" }, 500);
  }
  return c.json({ data: { revoked: true } });
});

export default apiKeys;
