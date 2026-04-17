import type { Context } from "hono";

/**
 * Global error handler for Hono.
 * Catches unhandled errors and returns a consistent JSON response.
 */
export function errorHandler(err: Error, c: Context) {
  console.error(`[${c.req.method}] ${c.req.path}:`, err.message);

  // Don't leak internal errors in production
  const isDev = process.env.NODE_ENV !== "production";

  return c.json(
    {
      error: isDev ? err.message : "Internal server error",
      ...(isDev && { stack: err.stack }),
    },
    500
  );
}
