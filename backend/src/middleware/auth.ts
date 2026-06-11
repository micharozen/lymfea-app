import type { Context, Next } from "hono";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Auth context added to requests after validation.
 */
export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

/**
 * Middleware: Validate Supabase JWT and attach user to context.
 *
 * Reads the Authorization header (Bearer <token>), verifies it
 * against Supabase Auth, and stores the user in c.set("user", ...).
 *
 * This replaces the manual auth check in invokeEdgeFunction().
 * Your existing Supabase JWTs work as-is — zero frontend auth changes.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Role lives in the `user_roles` table (admin / concierge / therapist).
  // `app_metadata.app_role` is a fallback for any legacy users that may
  // still have it set there.
  let role: string | undefined = user.app_metadata?.app_role;
  if (!role) {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "concierge", "therapist"])
      .maybeSingle();
    role = roleRow?.role ?? undefined;
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    role,
  } satisfies AuthUser);

  await next();
}

/**
 * Middleware: Require a specific role (admin, concierge, therapist).
 * Must be used after authMiddleware.
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as AuthUser | undefined;

    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    if (!user.role || !roles.includes(user.role)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    await next();
  };
}
