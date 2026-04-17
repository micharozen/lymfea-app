import { supabase } from "@/integrations/supabase/client";

/**
 * Backend API client — drop-in replacement for invokeEdgeFunction().
 *
 * MIGRATION STRATEGY:
 * 1. Start by moving Edge Functions to the backend one by one
 * 2. For each migrated function, change the frontend call from:
 *      invokeEdgeFunction('check-availability', { body: { hotelId, date } })
 *    to:
 *      invokeApi('availability/check', { body: { hotelId, date } })
 * 3. Non-migrated functions continue to use invokeEdgeFunction() as before
 *
 * The API and auth pattern are identical — Supabase JWT is passed
 * in the Authorization header, same as before.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface ApiOptions<T = unknown> {
  body?: T;
  /** If true, skip authentication (for public endpoints) */
  skipAuth?: boolean;
  /** HTTP method (defaults to POST) */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export interface ApiResult<T> {
  data: T | null;
  error: Error | null;
}

/**
 * Call the Hono backend API.
 *
 * Uses the same Supabase JWT token for authentication.
 * The backend validates this token via Supabase Auth (same DB, same users).
 *
 * @param path - API path (e.g., "availability/check", "payments/finalize")
 * @param options - Request options
 */
export async function invokeApi<TRequest = unknown, TResponse = unknown>(
  path: string,
  options: ApiOptions<TRequest> = {}
): Promise<ApiResult<TResponse>> {
  const { body, skipAuth = false, method = "POST" } = options;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!skipAuth) {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        return {
          data: null,
          error: new Error(`Session error: ${sessionError.message}`),
        };
      }

      if (!session) {
        return {
          data: null,
          error: new Error("No active session. Please log in again."),
        };
      }

      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const url = `${API_BASE_URL}/${path}`;

    const response = await fetch(url, {
      method,
      headers,
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage =
        errorData?.error || `API error: ${response.status} ${response.statusText}`;
      return { data: null, error: new Error(errorMessage) };
    }

    const data = (await response.json()) as TResponse;
    return { data, error: null };
  } catch (err) {
    console.error(`[api] Error calling ${path}:`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown error"),
    };
  }
}
