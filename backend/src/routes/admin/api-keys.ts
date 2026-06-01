import { Hono } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { authMiddleware, requireRole } from "../../middleware/auth";

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
